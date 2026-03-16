"""Memory Engine async HTTP client — pure Python, no Node.js dependencies."""

from __future__ import annotations

import json
import logging

import httpx

logger = logging.getLogger(__name__)

# Must match the TypeScript MARKER constant in src/lib/extract.ts exactly.
_MEMORIES_JSON_MARKER = "MEMORIES_JSON:"

_VALID_MEMORY_TYPES = {"episodic", "semantic", "preference", "procedural"}


def _parse_memories_json(response: str) -> list[dict]:
    """Parse a MEMORIES_JSON block embedded in an LLM response.

    Replicates the TypeScript ``parseBlock`` logic in src/lib/extract.ts.

    Parameters
    ----------
    response:
        Raw LLM response text that may contain a ``MEMORIES_JSON:`` block.

    Returns
    -------
    list[dict]
        List of memory dicts with keys ``content``, ``type``, and
        ``importance``.  Returns ``[]`` if no block is found or if JSON
        parsing fails.
    """
    idx = response.find(_MEMORIES_JSON_MARKER)
    if idx == -1:
        return []

    json_str = response[idx + len(_MEMORIES_JSON_MARKER):].strip()
    try:
        raw = json.loads(json_str)
    except json.JSONDecodeError as e:
        logger.warning("[MemoryEngine] MEMORIES_JSON parse error: %s", e)
        return []

    memories: list[dict] = []

    for m in raw.get("memories") or []:
        content = str(m.get("content") or "").strip()
        if len(content) < 8:
            continue
        mem_type = m.get("type")
        if mem_type not in _VALID_MEMORY_TYPES:
            mem_type = "episodic"
        try:
            importance = max(1, min(5, int(m.get("importance") or 3)))
        except (TypeError, ValueError):
            importance = 3
        memories.append({"content": content, "type": mem_type, "importance": importance})

    return memories


class MemoryEngine:
    """Async HTTP client for the Memory Engine REST API.

    Parameters
    ----------
    user_id:
        Identifier for the memory owner. Defaults to "default".
    api_url:
        Base URL of the running Memory Engine server.
        Defaults to "http://localhost:3000".
    api_key:
        Optional bearer token forwarded as Authorization header (Pro tier).
    """

    def __init__(
        self,
        user_id: str = "default",
        api_url: str = "http://localhost:3000",
        api_key: str | None = None,
    ) -> None:
        self.user_id = user_id
        self.api_url = api_url.rstrip("/")
        self._headers: dict[str, str] = {"Content-Type": "application/json"}
        if api_key:
            self._headers["Authorization"] = f"Bearer {api_key}"

    # ------------------------------------------------------------------
    # Core workflow helpers
    # ------------------------------------------------------------------

    async def before(self, messages: list[dict]) -> list[dict]:
        """Inject memory context into an OpenAI-style messages list.

        Calls GET /api/memory/inject?userId=<user_id> and prepends the
        returned system-prompt block to the messages list.

        - If the first message already has role=system, the memory block is
          prepended to its content.
        - Otherwise a new system message is inserted at position 0.
        - If the API call fails for any reason the original list is returned
          unchanged.

        Parameters
        ----------
        messages:
            List of OpenAI-style message dicts, e.g.
            [{"role": "user", "content": "Hello"}]

        Returns
        -------
        list[dict]
            The (potentially augmented) messages list.
        """
        try:
            async with httpx.AsyncClient(headers=self._headers, timeout=10.0) as client:
                resp = await client.get(
                    f"{self.api_url}/api/memory/inject",
                    params={"userId": self.user_id},
                )
                resp.raise_for_status()
                data: dict = resp.json()

            block: str = data.get("systemPromptBlock", "")
            if not block:
                return messages

            # Work on a shallow copy so we don't mutate the caller's list.
            messages = list(messages)

            if messages and messages[0].get("role") == "system":
                messages[0] = {
                    **messages[0],
                    "content": block + "\n\n" + messages[0]["content"],
                }
            else:
                messages.insert(0, {"role": "system", "content": block})

            return messages

        except Exception as e:  # noqa: BLE001
            logger.warning("[MemoryEngine] before() failed to inject memories: %s", e)
            return messages

    async def after(self, response: str, user_id: str = "default") -> None:
        """Extract and store memories from an LLM response.

        Path A (free): if the response contains a ``MEMORIES_JSON:`` block,
        each embedded memory is posted to ``POST /api/memory`` with the
        correct ``type`` and ``importance`` fields parsed from the block.

        Path B (fallback): if no block is found, the FULL response is stored
        as a single ``episodic`` memory with ``importance=3``.

        Errors are logged as warnings — this method never raises.

        Parameters
        ----------
        response:
            The raw text returned by the LLM.
        user_id:
            Identifier for the memory owner.  When omitted the instance
            ``user_id`` set at construction time is used.
        """
        effective_user_id = user_id if user_id != "default" else self.user_id
        try:
            memories = _parse_memories_json(response)
            async with httpx.AsyncClient(headers=self._headers, timeout=10.0) as client:
                if memories:
                    for mem in memories:
                        payload = {
                            "userId": effective_user_id,
                            "type": mem["type"],
                            "content": mem["content"],
                            "importance": mem["importance"],
                        }
                        try:
                            resp = await client.post(
                                f"{self.api_url}/api/memory",
                                json=payload,
                            )
                            resp.raise_for_status()
                        except Exception as e:  # noqa: BLE001
                            logger.warning("[MemoryEngine] failed to store memory: %s", e)
                else:
                    # Fallback: store first 1000 chars of response.
                    payload = {
                        "userId": effective_user_id,
                        "type": "episodic",
                        "content": response[:1000],
                        "importance": 3,
                    }
                    try:
                        resp = await client.post(
                            f"{self.api_url}/api/memory",
                            json=payload,
                        )
                        resp.raise_for_status()
                    except Exception as e:  # noqa: BLE001
                        logger.warning("[MemoryEngine] failed to store fallback memory: %s", e)
        except Exception as e:  # noqa: BLE001
            logger.warning("[MemoryEngine] after() encountered an unexpected error: %s", e)

    def after_sync(self, response: str) -> None:
        """Synchronous wrapper around :meth:`after`.

        Useful in non-async contexts (LangChain callbacks, scripts, etc.).
        Errors are silently swallowed — this method never raises.

        .. warning::
            This method uses ``asyncio.run()`` internally and is only safe
            to call from a **synchronous** context. If your code is already
            running inside an async event loop (e.g. FastAPI, Jupyter,
            async LangChain runnables), call ``await engine.after(response)``
            directly to avoid a "This event loop is already running" RuntimeError.

        Parameters
        ----------
        response:
            The raw text returned by the LLM.
        """
        import asyncio

        try:
            asyncio.run(self.after(response))
        except Exception as e:  # noqa: BLE001
            logger.warning("[MemoryEngine] after_sync() failed: %s", e)

    # ------------------------------------------------------------------
    # Read helpers
    # ------------------------------------------------------------------

    async def get_profile(self) -> dict:
        """Return the memory inject payload for this user.

        Calls GET /api/memory/inject?userId=<user_id> and returns the full
        response dict (keys: systemPromptBlock, tokenCount).
        Returns ``{}`` on any error.
        """
        try:
            async with httpx.AsyncClient(headers=self._headers, timeout=10.0) as client:
                resp = await client.get(
                    f"{self.api_url}/api/memory/inject",
                    params={"userId": self.user_id},
                )
                resp.raise_for_status()
                return resp.json()
        except Exception as e:  # noqa: BLE001
            logger.warning("[MemoryEngine] get_profile() failed: %s", e)
            return {}

    async def get_threads(self, status: str = "open") -> list:
        """Return open threads (tasks) for this user.

        Calls GET /api/memory/threads?userId=<user_id>&status=<status> and
        returns the list of thread dicts.  Returns ``[]`` on any error.

        Parameters
        ----------
        status:
            Thread status filter. One of ``"open"``, ``"in_progress"``,
            ``"snoozed"``, ``"resolved"``.  Defaults to ``"open"``.
        """
        try:
            async with httpx.AsyncClient(headers=self._headers, timeout=10.0) as client:
                resp = await client.get(
                    f"{self.api_url}/api/memory/threads",
                    params={"userId": self.user_id, "status": status},
                )
                resp.raise_for_status()
                data = resp.json()
                if isinstance(data, list):
                    return data
                return data.get("threads", [])
        except Exception as e:  # noqa: BLE001
            logger.warning("[MemoryEngine] get_threads() failed: %s", e)
            return []

    async def export_memories(self, format: str = "json") -> str:  # noqa: A002
        """Export all memories for this user.

        Calls GET /api/memory/export?userId=<user_id>&format=<format>.

        Parameters
        ----------
        format:
            One of ``"json"``, ``"markdown"``, or ``"cursor-rules"``.

        Returns
        -------
        str
            Raw export payload as a string, or ``""`` on any error.
        """
        try:
            async with httpx.AsyncClient(headers=self._headers, timeout=30.0) as client:
                resp = await client.get(
                    f"{self.api_url}/api/memory/export",
                    params={"userId": self.user_id, "format": format},
                )
                resp.raise_for_status()
                # Return raw text regardless of content type.
                return resp.text
        except Exception as e:  # noqa: BLE001
            logger.warning("[MemoryEngine] export_memories() failed: %s", e)
            return ""

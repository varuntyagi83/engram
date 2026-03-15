"""Memory Engine async HTTP client — pure Python, no Node.js dependencies."""

from __future__ import annotations

import httpx


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

        except Exception:  # noqa: BLE001
            return messages

    async def after(self, response: str) -> None:
        """Fire-and-forget: extract and store memories from an LLM response.

        Posts the first 500 characters of the response to
        POST /api/memory as an episodic memory with importance 2.
        Errors are silently swallowed — this method never raises.

        Parameters
        ----------
        response:
            The raw text returned by the LLM.
        """
        try:
            payload = {
                "userId": self.user_id,
                "type": "episodic",
                "content": response[:500],
                "importance": 2,
            }
            async with httpx.AsyncClient(headers=self._headers, timeout=10.0) as client:
                resp = await client.post(
                    f"{self.api_url}/api/memory",
                    json=payload,
                )
                resp.raise_for_status()
        except Exception:  # noqa: BLE001
            pass

    def after_sync(self, response: str) -> None:
        """Synchronous wrapper around :meth:`after`.

        Useful in non-async contexts (LangChain callbacks, scripts, etc.).
        Errors are silently swallowed — this method never raises.

        Parameters
        ----------
        response:
            The raw text returned by the LLM.
        """
        import asyncio

        try:
            asyncio.run(self.after(response))
        except Exception:  # noqa: BLE001
            pass

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
        except Exception:  # noqa: BLE001
            return {}

    async def get_threads(self) -> list:
        """Return thread-type memories for this user.

        Calls GET /api/memory?userId=<user_id>&type=threads and returns the
        list of thread dicts.  Returns ``[]`` on any error.
        """
        try:
            async with httpx.AsyncClient(headers=self._headers, timeout=10.0) as client:
                resp = await client.get(
                    f"{self.api_url}/api/memory",
                    params={"userId": self.user_id, "type": "threads"},
                )
                resp.raise_for_status()
                data = resp.json()
                # API may return {"memories": [...]} or a bare list.
                if isinstance(data, list):
                    return data
                return data.get("memories", data.get("threads", []))
        except Exception:  # noqa: BLE001
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
        except Exception:  # noqa: BLE001
            return ""

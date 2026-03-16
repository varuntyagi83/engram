"""LangChain integration for Memory Engine."""

from __future__ import annotations

from typing import Any

try:
    from langchain.memory import BaseChatMemory
    from langchain.schema import AIMessage, BaseMessage, HumanMessage  # noqa: F401

    LANGCHAIN_AVAILABLE = True
except ImportError:
    LANGCHAIN_AVAILABLE = False
    BaseChatMemory = object  # type: ignore[assignment,misc]  # fallback base

from .client import MemoryEngine


class MemoryEngineMemory(BaseChatMemory):  # type: ignore[misc]
    """LangChain memory integration backed by Memory Engine.

    Drop-in replacement for any LangChain ``BaseChatMemory`` subclass.
    Loads the user's memory context on each chain invocation and persists
    AI responses back to the Memory Engine API after each turn.

    Parameters
    ----------
    user_id:
        Memory Engine user identifier.
    api_url:
        Base URL of the running Memory Engine server.
    **kwargs:
        Forwarded to ``BaseChatMemory.__init__``.

    Example
    -------
    .. code-block:: python

        from langchain.chains import ConversationChain
        from langchain_openai import ChatOpenAI
        from memory_engine.langchain import MemoryEngineMemory

        memory = MemoryEngineMemory(user_id="alice")
        chain = ConversationChain(llm=ChatOpenAI(), memory=memory)
        chain.run("Tell me a joke.")
    """

    user_id: str = "default"
    api_url: str = "http://localhost:3000"

    def __init__(
        self,
        user_id: str = "default",
        api_url: str = "http://localhost:3000",
        **kwargs: Any,
    ) -> None:
        super().__init__(**kwargs)
        self.user_id = user_id
        self.api_url = api_url
        self._engine = MemoryEngine(user_id=user_id, api_url=api_url)

    # ------------------------------------------------------------------
    # LangChain memory interface
    # ------------------------------------------------------------------

    @property
    def memory_variables(self) -> list[str]:
        """Variables injected into the chain's prompt inputs."""
        return ["memory_context"]

    def load_memory_variables(self, inputs: dict[str, Any]) -> dict[str, Any]:
        """Synchronously load memory context for a LangChain chain run.

        Returns a dict with key ``"memory_context"`` containing the
        stringified profile data fetched from the Memory Engine API.
        Falls back to an empty string on any error so the chain always
        receives a value for the variable.

        .. warning::
            This method uses ``asyncio.run()`` internally and is only safe
            to call from a **synchronous** context. If your chain is already
            running inside an async event loop (e.g. FastAPI, Jupyter,
            async LangChain runnables), use the async variant instead to
            avoid a "This event loop is already running" RuntimeError.

        Parameters
        ----------
        inputs:
            The chain's current input dict (unused, included for interface
            compatibility).
        """
        import asyncio

        try:
            profile_data = asyncio.run(self._engine.get_profile())
            return {"memory_context": str(profile_data)}
        except Exception:  # noqa: BLE001
            return {"memory_context": ""}

    def save_context(
        self, inputs: dict[str, Any], outputs: dict[str, str]
    ) -> None:
        """Persist the AI response back to Memory Engine.

        Called automatically by LangChain at the end of each chain turn.
        The ``"output"`` key in *outputs* is treated as the LLM response.
        Silently skips if the output is empty or the API call fails.

        Parameters
        ----------
        inputs:
            The chain's input dict for this turn (unused here).
        outputs:
            The chain's output dict; expected to contain key ``"output"``.
        """
        response: str = outputs.get("output", "")
        if response:
            self._engine.after_sync(response)

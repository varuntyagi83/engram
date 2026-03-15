# Memory Engine Python SDK

pip install memory-engine-sdk

from memory_engine import MemoryEngine
me = MemoryEngine(user_id="alice", api_url="http://localhost:3000")
messages = await me.before([{"role": "user", "content": "Hello"}])
me.after_sync(llm_response)

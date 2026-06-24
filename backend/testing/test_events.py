import asyncio
import os
from openhands.sdk import LLM, Agent, Conversation, Tool
from openhands.tools.terminal import TerminalTool
from openhands.sdk.event import MessageEvent, ActionEvent, ObservationEvent

async def main():
    llm = LLM(
        model=os.getenv("LLM_MODEL", "openai/meta/llama-3.1-70b-instruct"),
        api_key=os.getenv("LLM_API_KEY"),
        base_url=os.getenv("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1"),
    )

    agent = Agent(llm=llm, tools=[Tool(name=TerminalTool.name)])

    def on_event(event):
        print(f"EVENT: {type(event).__name__}")
        if isinstance(event, MessageEvent):
            source = getattr(event, "source", "unknown")
            print(f"  -> MessageEvent (source={source})")

    conversation = Conversation(
        agent=agent,
        workspace=os.path.abspath("workspace/target-project"),
        callbacks=[on_event],
    )

    print("Sending message...")
    conversation.send_message("Hi")

    print("Running conversation...")
    await asyncio.to_thread(conversation.run)

if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()
    asyncio.run(main())

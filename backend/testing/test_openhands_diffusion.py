import os
import sys

# Ensure backend directory is in path for imports
backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
if backend_dir not in sys.path:
    sys.path.insert(0, backend_dir)

from dotenv import load_dotenv
load_dotenv(os.path.join(backend_dir, ".env"))

from openhands.sdk import LLM, Agent, Tool, Conversation
from openhands.tools.terminal import TerminalTool
from openhands.tools.file_editor import FileEditorTool
import uuid

def main():
    llm_model = os.getenv("TEST_LLM_MODEL", "openai/google/gemma-4-31b-it")
    llm_api_key = os.getenv("LLM_API_KEY")
    llm_base_url = os.getenv("LLM_BASE_URL")
    
    print(f"Testing Model: {llm_model}")
    print(f"Base URL: {llm_base_url}")
    
    llm = LLM(
        model=llm_model,
        api_key=llm_api_key,
        base_url=llm_base_url,
        stream=True,
        native_tool_calling=False,
        litellm_extra_body={"parallel_tool_calls": True},
    )
    
    agent = Agent(
        llm=llm,
        tools=[
            Tool(name=TerminalTool.name),
            Tool(name=FileEditorTool.name),
        ]
    )
    
    prompt = "Can you create a simple text file named test_gemma.txt with the word 'Hello' in it in the current directory?"
    
    print(f"Running agent with prompt: {prompt}")
    print("-" * 50)
    try:
        workspace_path = os.path.abspath(os.path.join(backend_dir, "testing", "test_workspace"))
        os.makedirs(workspace_path, exist_ok=True)
        
        def on_event(event):
            print(f"Event: {event}")
            
        def on_token(chunk):
            pass
        
        conversation = Conversation(
            agent=agent,
            workspace=workspace_path,
            persistence_dir=os.path.join(backend_dir, ".agent_runs"),
            conversation_id=uuid.uuid4(),
            callbacks=[on_event],
            token_callbacks=[on_token],
        )
        conversation.send_message(prompt)
        conversation.run()
        
        print("Agent finished successfully.")
    except Exception as e:
        print(f"Agent failed with exception: {e}")
        import traceback
        traceback.print_exc()

if __name__ == "__main__":
    main()

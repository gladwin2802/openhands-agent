import litellm
import os

api_key = os.environ.get("LLM_API_KEY")
api_base = "https://integrate.api.nvidia.com/v1"

tools = [
    {
        "type": "function",
        "function": {
            "name": "get_weather",
            "description": "Get the current weather",
            "parameters": {
                "type": "object",
                "properties": {
                    "location": {"type": "string"}
                }
            }
        }
    }
]

try:
    response = litellm.completion(
        model="openai/meta/llama-3.1-70b-instruct",
        api_key=api_key,
        api_base=api_base,
        messages=[{"role": "user", "content": "What is the weather in Tokyo?"}],
        tools=tools,
        stream=True
    )
    for chunk in response:
        print(chunk)
except Exception as e:
    print("Error:", e)

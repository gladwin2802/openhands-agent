import litellm
import os

api_key = os.environ.get("LLM_API_KEY")
api_base = "https://integrate.api.nvidia.com/v1"

try:
    response = litellm.completion(
        model="openai/minimaxai/minimax-m3",
        api_key=api_key,
        api_base=api_base,
        messages=[{"role": "user", "content": "Hello"}],
        max_tokens=10,
        stream=True
    )
    for chunk in response:
        print(chunk.choices[0].delta.content or "", end="")
    print()
except Exception as e:
    print("Error:", e)

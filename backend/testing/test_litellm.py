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
        max_tokens=10
    )
    print("Success:", response.choices[0].message.content)
except Exception as e:
    print("Error:", e)

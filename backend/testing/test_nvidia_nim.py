import litellm
import os

api_key = os.environ.get("LLM_API_KEY", "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")
os.environ["NVIDIA_NIM_API_KEY"] = api_key

try:
    response = litellm.completion(
        model="nvidia_nim/meta/llama3-70b-instruct",
        messages=[{"role": "user", "content": "Hello"}]
    )
    print("Success:", response.choices[0].message.content)
except Exception as e:
    print("Error:", e)

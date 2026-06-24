import litellm
import os

api_key = os.environ.get("LLM_API_KEY")
os.environ["NVIDIA_NIM_API_KEY"] = api_key

try:
    response = litellm.completion(
        model="nvidia_nim/meta/llama3-70b-instruct",
        messages=[{"role": "user", "content": "Hello"}]
    )
    print("Success:", response.choices[0].message.content)
except Exception as e:
    print("Error:", e)

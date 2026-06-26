import os
import requests
import json
from dotenv import load_dotenv

backend_dir = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
load_dotenv(os.path.join(backend_dir, ".env"))

api_key = os.getenv("LLM_API_KEY")
base_url = os.getenv("LLM_BASE_URL", "https://integrate.api.nvidia.com/v1")

model_name = "google/gemma-4-31b-it"

headers = {
    "Authorization": f"Bearer {api_key}",
    "Content-Type": "application/json"
}

payload = {
    "model": model_name,
    "messages": [
        {"role": "user", "content": "Hello"}
    ],
    "max_tokens": 50
}

print(f"Testing raw API request to {base_url}/chat/completions for model {model_name}...")
try:
    response = requests.post(f"{base_url}/chat/completions", headers=headers, json=payload, timeout=10)
    print(f"Status Code: {response.status_code}")
    print(f"Response: {response.text}")
except Exception as e:
    print(f"Request failed: {e}")

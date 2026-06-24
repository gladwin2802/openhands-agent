import os
from openai import OpenAI

api_key = os.environ.get("LLM_API_KEY")
base_url = "https://integrate.api.nvidia.com/v1"

client = OpenAI(
  base_url = base_url,
  api_key = api_key
)

try:
    completion = client.chat.completions.create(
      model="nonsense_model_id",
      messages=[{"role":"user","content":"Hello World"}],
      temperature=0.5,
      max_tokens=1024
    )
    print("Success:", completion.choices[0].message.content)
except Exception as e:
    print("Error:", e)

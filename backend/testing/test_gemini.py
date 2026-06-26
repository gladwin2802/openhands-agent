import os
from openai import OpenAI
from dotenv import load_dotenv
load_dotenv(r"C:\Users\Gladwin.aj\Downloads\DnA\Openhands_Agent\backend\.env")

# Get the Google Gemini API key from the environment
# (Or replace the os.environ.get with your actual key string)
api_key = os.getenv("GEMINI_API_KEY") 

# Google's OpenAI compatibility Base URL
base_url = "https://generativelanguage.googleapis.com/v1beta/openai/"

try:
    client = OpenAI(
      base_url=base_url,
      api_key=api_key
    )
    print(f"Testing Google API with model: gemini-2.5-flash-lite...")
    completion = client.chat.completions.create(
      model="gemini-2.5-flash-lite",
      messages=[{"role": "user", "content": "Hello! Give me a very short 1 sentence response."}],
      temperature=0.5,
      max_tokens=1024
    )
    print("\nSuccess! Response:")
    print(completion.choices[0].message.content)
except Exception as e:
    print("\nError:", e)
    if not api_key:
        print("Hint: It looks like GEMINI_API_KEY is not set. Please set it before running this script.")

from fastapi import FastAPI, HTTPException, BackgroundTasks
from pydantic import BaseModel
import os
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

app = FastAPI(title="Mentora AI OCR Pipeline")

# Initialize Supabase client
url: str = os.environ.get("SUPABASE_URL", "")
key: str = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "")
if url and key:
    supabase: Client = create_client(url, key)

class ProcessPaperRequest(BaseModel):
    paper_id: str
    pdf_url: str

def process_pdf_background(paper_id: str, pdf_url: str):
    """
    Background task to process the uploaded PDF:
    1. Download PDF from Supabase Storage
    2. Convert pages to images (pdf2image)
    3. Extract text (pytesseract or OpenAI Vision)
    4. Pass text to LLM to split into specific Questions
    5. Generate Embeddings via OpenAI
    6. Insert into 'questions' table in Supabase
    """
    try:
        print(f"Starting background processing for Paper ID: {paper_id}")
        
        # Step 1: Download & OCR (Mocked for now)
        # raw_text = perform_ocr(pdf_url)
        
        # Step 2: Split into questions using LangChain + OpenAI
        # questions_json = split_into_questions(raw_text)
        
        # Step 3: Embed & Insert to Supabase
        # for q in questions_json:
        #    embedding = get_embedding(q.text)
        #    supabase.table("questions").insert({...}).execute()
        
        print(f"Successfully processed Paper ID: {paper_id}")
    except Exception as e:
        print(f"Failed to process Paper ID {paper_id}: {str(e)}")

@app.post("/process-paper")
async def trigger_paper_processing(request: ProcessPaperRequest, background_tasks: BackgroundTasks):
    """
    Webhook endpoint triggered by Supabase or Admin Dashboard when a new Paper is uploaded.
    """
    if not url or not key:
        raise HTTPException(status_code=500, detail="Supabase credentials not configured")

    # Add the intensive OCR and AI splitting to a background queue
    background_tasks.add_task(process_pdf_background, request.paper_id, request.pdf_url)
    
    return {"message": "Paper processing started successfully", "paper_id": request.paper_id}

@app.get("/health")
def health_check():
    return {"status": "ok", "service": "Mentora OCR Microservice"}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)

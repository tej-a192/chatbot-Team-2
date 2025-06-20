# AI Tutor: Intelligent Learning Assistant

This project is a comprehensive AI-powered tutoring application designed to assist users through interactive chat, document analysis, and knowledge exploration. It integrates multiple Large Language Models (LLMs), Retrieval Augmented Generation (RAG) for contextual understanding from user-uploaded documents, and knowledge graph capabilities for critical thinking. The system also includes an admin interface for managing shared knowledge resources.

## Prerequisites

Before you begin, ensure you have the following installed and configured:

- **Node.js**: Version 18.x or later.
- **npm**: For managing Node.js packages.
- **Python**: Version 3.9 - 3.11 recommended. Check `server/rag_service/requirements.txt` for specific library compatibility.
- **pip**: For installing Python packages.
- **MongoDB**: A running instance for data storage (user accounts, chat history, document metadata).
- **Docker**: Docker desktop version is required to run the containers (Neo4j & Qdrant)
    - **Neo4j**: A running instance for graph database (used by the Python RAG service for knowledge graphs).
    - **Qdrant**: A running instance for vector database (used by the Python RAG service).
- **Google Gemini API Key** (Mandatory): If you plan to use Google's Gemini models.
- **Ollama** (Optional): If you plan to use locally hosted Ollama models. Ensure Ollama is installed, running, and accessible.
- **Tesseract OCR** (Mandatory): For processing image-based documents in the RAG service. Ensure it's installed and the path to the executable is correctly set in `server/rag_service/config.py` (via the `TESSERACT_CMD` environment variable loaded into `server/.env`).

## Installation Steps

1. **Clone the Repository:**
    ```bash
    git clone https://github.com/tej-a192/chatbot-Team-2.git
    cd chatbot-Team-2
    ```

2. **Backend Setup (Node.js Server):**
    ```bash
    cd server
    cp .env.example .env
    ```

    Fill `.env` with:
    ```env
    PORT=5001
    MONGO_URI="your_mongodb_connection_string"
    JWT_SECRET="your_strong_jwt_secret"
    GEMINI_API_KEY="your_gemini_api_key"
    PYTHON_RAG_SERVICE_URL="http://127.0.0.1:5000"
    OLLAMA_API_BASE_URL="http://<ollama_host>:<ollama_port>"
    OLLAMA_DEFAULT_MODEL="your_default_ollama_model"
    NEO4J_URI="bolt://localhost:7687"
    NEO4J_USERNAME="neo4j_user"
    NEO4J_PASSWORD="password"
    NEO4J_DATABASE="neo4j"
    QDRANT_HOST="localhost"
    QDRANT_PORT=6333
    FIXED_ADMIN_USERNAME="admin"
    FIXED_ADMIN_PASSWORD="admin123"
    ```

    Then install dependencies:
    ```bash
    npm install
    ```

3. **Tesseract OCR Installation & Setup (Windows users):**
    - Install from: https://github.com/UB-Mannheim/tesseract/wiki#tesseract-at-ub-mannheim
    - Add `C:\Program Files\Tesseract-OCR` to your system's environment variables.

4. **FFmpeg Installation (Windows users):**
    - Download from: https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip
    - Extract to: `C:\ffmpeg`
    - Add `C:\ffmpeg\bin` to system’s environment variables.

5. **Backend Setup (Python RAG & KG Service):**
    ```bash
    cd server/rag_service
    cp .env.example .env
    pip install -r requirements.txt
    python -m spacy download en_core_web_sm
    ```

6. **Run Services**

    - **Start Docker Services (Neo4j & Qdrant)**:
        ```bash
        docker compose up -d
        ```

    - **Run Python Flask Service (RAG/KG):**
        ```bash
        python app.py
        ```

    - **Run Node.js Backend Server:**
        ```bash
        cd ../
        npm start
        ```

7. **Frontend Setup:**
    ```bash
    cd frontend
    cp .env.example .env
    ```

    Fill `.env` with:
    ```env
    VITE_API_BASE_URL=http://localhost:5001/api
    VITE_ADMIN_USERNAME=admin
    VITE_ADMIN_PASSWORD=admin123
    ```

    Then install dependencies:
    ```bash
    npm install
    ```

8. **Run Frontend:**
    ```bash
    npm run dev
    ```

## Features

- **User Authentication**: Secure signup and login for regular users.
- **Admin Portal**: Dedicated login and dashboard for administrators to manage shared documents and view their analysis.
- **Interactive Chat Interface**: Real-time chat with an AI tutor.
- **Multi-LLM Support**:
  - Google Gemini integration
  - Ollama (local) integration
  - Switch between LLMs dynamically
- **Retrieval Augmented Generation (RAG)**:
  - Document upload, parsing, and context-aware responses
  - Toggle RAG usage on/off
- **Knowledge Graph (KG) Enhanced Critical Thinking**:
  - Auto-generated KG from document content
  - Toggle KG-based reasoning
- **Document Management**:
  - Upload, list, delete, analyze (FAQs, key topics, mind map)
- **Advanced Analysis Tools**:
  - FAQ Generator
  - Key Topic Extractor
  - Mind Map Generator (Mermaid.js)
- **Chat History**: Reload past chats
- **System Prompts**:
  - Friendly Tutor, Concept Explorer, Knowledge Check, Custom
- **Subject Focus**: Chat can focus on selected admin documents
- **Agentic Frameworks**:
  - **Web Search Agent** using DuckDuckGo for real-time web info
  - **Podcast Generator** using gTTS + FFmpeg to generate audio summaries
- **Other Features**:
  - Speech-to-Text input
  - Text-to-Speech AI output
  - Light/Dark theme toggle
  - Mobile responsive UI

## Contributors

1. **Pavan Teja B**
2. **Livingston D**
3. **Murali Krishna B**
4. **Mahaboob Subhani SK**
5. **Anusha P**

## 📽️ Demo Video

[Click here to watch the full demo](https://drive.google.com/file/d/107Sbtf64_KrW18NLRDvvUS0_BnpWmFJ9/view?usp=sharing)

## Features Not in Video

1. Agentic Framework
2. Web Search
3. Podcast Generation
4. Long Term Memory
5. Content Generation (DOCX, PPTX)
6. Knowledge Graph Visualization

---

## 👥 Team Contributions

| Name                      | Branch     | Key Contributions                                                                                       | Link |
|---------------------------|------------|----------------------------------------------------------------------------------------------------------|------|
| **Pavan Teja B**          | dev/rex    | File parsing, FAQ/Topic/Mindmap analysis, KG generation, DB, Prompting                                  | [Demo](https://drive.google.com/file/d/107Sbtf64_KrW18NLRDvvUS0_BnpWmFJ9/view?usp=sharing) |
| **Rohith Syam Livingston D** | alpha  | Qdrant, Neo4j, Mermaid, Admin Features, Critical Thinking, Long Term Memory                             | [Demo](https://drive.google.com/file/d/1qmUmFZX1RuCS3icSPGMQ2kAHeJERGRAr/view?usp=drive_link) |
| **Murali Krishna B**      | dev-mk     | Front & backend integration, Multi-LLM switch, Session & state management                                |  |
| **Mehaboob Subhani**      | skms       | UI, Web Search agent, Content Gen (PPT/DOCX), Podcast Gen (gTTS), User Profile Mgmt                      | [Demo](https://drive.google.com/file/d/1OV0eD5PkwTATlsBHhuT6u4A-cKnuMyke/view?usp=sharing) |
| **Anusha P**              | anu        | Research, Speech-to-Text, Text-to-Speech                                                                 |  |

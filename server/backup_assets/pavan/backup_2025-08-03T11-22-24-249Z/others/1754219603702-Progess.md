# 📘 Phase 2 Development Plan: Actionable TODO List

**🎯 Goal:** Multi-Agent Driven Generative iMentor augmented by Knowledge from varied resources towards STUDENT-CENTRIC LEARNING

---

## ✅ Legend
- ✅ = Completed
- ❌ = Not Started
- 🔄 = In Progress

---

### 📂 P2.1 Adaptive Learning Pathways & Personalized Content Curation

| ID | Task | Description | Dependencies | Status |
|----|------|-------------|--------------|--------|
| P2.1.1 | Develop Student Profile & Learning Style Modeler | Create user profiles storing preferences, background, and performance data | MongoDB, VARK, Collaborative Filtering | ❌ |
| P2.1.2 | Implement Knowledge Gap Identification Module | Analyze interactions to find weak areas using semantic analysis | LLMs, Concept Maps | ❌ |
| P2.1.3 | Build Personalized Resource Recommendation Engine | Recommend multi-modal resources based on gaps | FAISS, Neo4j, Filtering | ❌ |
| P2.1.4 | Create Learning Path Orchestrator Agent | Sequence resources into logical adaptive paths | LangGraph, Autogen | ❌ |

---

### 📂 P2.2 Interactive Research Assistant (Multi-modal Retrieval)

| ID | Task | Description | Dependencies | Status |
|----|------|-------------|--------------|--------|
| P2.2.1 | Build Multi-Modal Data Ingestion Pipeline | Ingest video, audio, code, webpages | FFmpeg, Whisper, Pytube, Playwright | ❌ |
| P2.2.2 | Integrate Multi-Modal Embedding & Vector DB | Store vector embeddings for varied data | CLIP, Milvus, Weaviate | ❌ |
| P2.2.3 | Implement Advanced Semantic Search | Retrieve segments using hybrid search | Hybrid Search, Cross-modal Retrieval | ❌ |
| P2.2.4 | Create Information Synthesis & Summarization Agent | Synthesize key info & flag discrepancies | LLMs, LangGraph, Autogen | ❌ |

---

### 📂 P2.3 Dynamic Concept Mapping & Knowledge Synthesis

| ID | Task | Description | Dependencies | Status |
|----|------|-------------|--------------|--------|
| P2.3.1 | Develop Real-time KG Construction Agent | Analyze content to update KG in real-time | spaCy, OpenIE, Neo4j | ❌ |
| P2.3.2 | Build Interactive KG Visualization Front-End | UI to zoom/pan/explore concept maps | react-flow, d3.js | ❌ |
| P2.3.3 | Implement KG-Enhanced Query & Response Generation | Use KG for more contextual answers | KG-RAG, Graph Embedding | ❌ |

---

### 📂 P2.4 Generative AI for Academic Content Creation

| ID | Task | Description | Dependencies | Status |
|----|------|-------------|--------------|--------|
| P2.4.1 | Create Specialized Content Generation Agents | Generate reports, presentations, podcasts | Gemini, Qwen, python-docx, pptx | ❌ |
| P2.4.2 | Implement Automated Citation & Reference Manager | Auto-insert formatted citations | OpenAlex, bibtexparser, Zotero API | ❌ |
| P2.4.3 | **Develop Academic Integrity & Bias Mitigation Module** | Check for plagiarism, bias, inaccuracies, suggest corrections | Turnitin, Fairlearn, Fact-check APIs | ❌ |
| P2.4.4 | Integrate Text-to-Speech (TTS) for Podcasts | Convert generated scripts into audio | Coqui TTS, Polly, Bark | ❌ |

---

### 📂 P2.5 Multi-LLM Orchestration for Enhanced Reasoning

| ID | Task | Description | Dependencies | Status |
|----|------|-------------|--------------|--------|
| P2.5.1 | Design Intelligent LLM Router/Orchestrator Agent | Route queries to best-suited LLM | LangGraph, LLM Classifiers | ❌ |
| P2.5.2 | Implement Backend for Dynamic LLM Management | Manage hosted/API-based LLMs | Ollama, Docker, Gateways | ❌ |
| P2.5.3 | Create Feedback Loop for LLM Optimization | Use feedback to improve routing logic | Logging, RLHF principles | ❌ |

---

### 📂 P2.6 "LLM Coach" for Prompt Engineering & Critical Evaluation

| ID | Task | Description | Dependencies | Status |
|----|------|-------------|--------------|--------|
| P2.6.1 | Build a Prompt Analysis & Improvement Agent | Suggest better prompts to students | LLMs, heuristic rules | ❌ |
| P2.6.2 | Integrate Critical Thinking & Verification Prompts | Encourage questioning & source checking | UI/UX cues | ❌ |
| P2.6.3 | Create a "Show Your Work" Explanation Agent | Explain chatbot reasoning | CoT, ToT prompting, KG | ❌ |

---

### 📂 P2.7 Comprehensive User & System Auditing

| ID | Task | Description | Dependencies | Status |
|----|------|-------------|--------------|--------|
| P2.7.1 | Design Centralized Logging Architecture | Stream logs from all services | ELK Stack, CloudWatch | ❌ |
| P2.7.2 | Implement User Activity Tracking | Log all significant user actions | API Middleware, Frontend Logs | ❌ |
| P2.7.3 | Implement System Performance & Error Monitoring | Track LLM/service health & errors | Prometheus, Grafana | ❌ |
| P2.7.4 | Create Audit Trail & Analytics Dashboard | Admin dashboard for insights and security | Grafana, React, Kibana | ❌ |

---

### 📂 P2.8 Subject-Specific LLM Trainer Module

| ID | Task | Description | Dependencies | Status |
|----|------|-------------|--------------|--------|
| P2.8.1 | Develop Secure Dataset Management System | Upload/version datasets | S3, MongoDB | ❌ |
| P2.8.2 | Implement Fine-Tuning Pipeline | Fine-tune LLMs on academic content | PEFT, HuggingFace, PyTorch | ❌ |
| P2.8.3 | Create Model Registry & Evaluation Framework | Track fine-tuned model performance | MLflow, W&B, custom scripts | ❌ |
| P2.8.4 | Integrate Fine-Tuned Models into Orchestrator | Route to domain-specific models | Router Agent, Model Registry | ❌ |

---

> ✍️ You can mark tasks as complete by replacing `❌` with `✅` and optionally updating progress notes inline.

---


import os
import json
import logging
import concurrent.futures
import ollama
from tqdm import tqdm

# Setup logging
logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# Initialize Ollama client
ollama_client = ollama.Client(host="http://172.180.9.187:11434")

# Template for prompting Ollama
prompt_template = """
You are an expert in knowledge graph creation. I have a chunk of lecture notes on machine learning. Your task is to read the text and create a partial graph-based memory map. Identify major topics as top-level nodes, subtopics as subnodes under their respective parents, and relationships between nodes. Output the result as a valid JSON object with "nodes" and "edges" sections. Ensure the JSON is complete and properly formatted. Ensure all node IDs and relationship types are strings.

Text chunk:
{chunk_text}

Output format:
{{
  "nodes": [
    {{"id": "Node Name", "type": "major/subnode", "parent": "Parent Node (if subnode) or null", "description": "Short description (max 50 words)"}}],
  "edges": [
    {{"from": "Node A", "to": "Node B", "relationship": "subtopic/depends_on/related_to"}}]
}}
"""

def split_into_chunks(text, chunk_size=2048, overlap=256):
    logger.info(f"Splitting text into chunks (size={chunk_size}, overlap={overlap})...")
    chunks = []
    start = 0
    text_len = len(text)

    while start < text_len:
        end = min(start + chunk_size, text_len)
        chunks.append(text[start:end])
        next_start = end - overlap
        start = max(next_start, start + 1) if end < text_len else end

    logger.info(f"Split text into {len(chunks)} chunks.")
    return chunks

def process_single_chunk(chunk_data):
    index, chunk_text = chunk_data
    chunk_num = index + 1
    full_prompt = prompt_template.format(chunk_text=chunk_text)

    try:
        response = ollama_client.chat(
            model="qwen2.5:14b-instruct",
            messages=[{"role": "user", "content": full_prompt}],
            format="json",
            options={"num_ctx": 4096, "temperature": 0.3}
        )

        content = response.get('message', {}).get('content', '')
        if not content:
            logger.warning(f"[Chunk {chunk_num}] Empty response")
            return None

        if content.strip().startswith("```json"):
            content = content.strip()[7:-3].strip()
        elif content.strip().startswith("```"):
            content = content.strip()[3:-3].strip()

        graph_data = json.loads(content)

        if isinstance(graph_data, dict) and 'nodes' in graph_data and 'edges' in graph_data:
            return graph_data
        else:
            logger.warning(f"[Chunk {chunk_num}] Invalid structure: {content[:200]}...")
            return None

    except json.JSONDecodeError as e:
        logger.error(f"[Chunk {chunk_num}] JSON decode error: {e}")
        return None
    except Exception as e:
        logger.error(f"[Chunk {chunk_num}] API call error: {e}")
        return None

def merge_graphs(graphs):
    logger.info("Merging graph fragments...")
    final_nodes = {}
    final_edges = set()

    for i, graph in enumerate(graphs):
        if graph is None:
            logger.warning(f"Skipping None graph at index {i}")
            continue
        if not isinstance(graph, dict) or 'nodes' not in graph or 'edges' not in graph:
            logger.warning(f"Skipping invalid graph at index {i}")
            continue

        for node in graph.get('nodes', []):
            if not isinstance(node, dict): continue
            node_id = node.get('id')
            if not node_id or not isinstance(node_id, str): continue

            if node_id not in final_nodes:
                final_nodes[node_id] = node
            else:
                existing = final_nodes[node_id]
                if isinstance(node.get('description'), str) and len(node['description']) > len(existing.get('description', '')):
                    existing['description'] = node['description']
                if existing.get('parent') is None and node.get('parent'):
                    existing['parent'] = node['parent']
                if existing.get('type') is None and node.get('type'):
                    existing['type'] = node['type']

        for edge in graph.get('edges', []):
            if not isinstance(edge, dict): continue
            if not all(k in edge for k in ['from', 'to', 'relationship']): continue
            if not all(isinstance(edge[k], str) for k in ['from', 'to', 'relationship']): continue

            final_edges.add((edge['from'], edge['to'], edge['relationship']))

    return {
        "nodes": list(final_nodes.values()),
        "edges": [{"from": f, "to": t, "relationship": r} for f, t, r in final_edges]
    }

def generate_kg_from_text(text: str) -> dict:
    logger.info("Starting KG generation from received text.")
    chunks = split_into_chunks(text)
    results = [None] * len(chunks)

    with concurrent.futures.ThreadPoolExecutor(max_workers=10) as executor:
        tasks = {executor.submit(process_single_chunk, (i, chunk)): i for i, chunk in enumerate(chunks)}
        for future in tqdm(concurrent.futures.as_completed(tasks), total=len(chunks), desc="Processing chunks", unit="chunk"):
            idx = tasks[future]
            try:
                results[idx] = future.result()
            except Exception as e:
                logger.error(f"Exception while processing chunk {idx}: {e}")

    valid_graphs = [g for g in results if g is not None]
    logger.info(f"Successfully processed {len(valid_graphs)} out of {len(chunks)} chunks.")

    if not valid_graphs:
        logger.warning("No valid graph fragments found.")
        return {"nodes": [], "edges": []}

    return merge_graphs(valid_graphs)

# server/rag_service/academic_search.py
import requests
import xml.etree.ElementTree as ET
import logging
from typing import List, Dict, Any

logger = logging.getLogger(__name__)

def search_arxiv(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    """Searches the ArXiv API for papers."""
    base_url = 'http://export.arxiv.org/api/query?'
    search_query = f'search_query=all:{query}&start=0&max_results={max_results}&sortBy=relevance'
    
    logger.info(f"Querying ArXiv with: {query}")
    response = requests.get(base_url + search_query, timeout=10)
    response.raise_for_status()
    
    root = ET.fromstring(response.content)
    papers = []
    for entry in root.findall('{http://www.w3.org/2005/Atom}entry'):
        paper = {
            'source': 'ArXiv',
            'title': entry.find('{http://www.w3.org/2005/Atom}title').text.strip(),
            'url': entry.find('{http://www.w3.org/2005/Atom}id').text.strip(),
            'summary': entry.find('{http://www.w3.org/2005/Atom}summary').text.strip(),
            'authors': [author.find('{http://www.w3.org/2005/Atom}name').text for author in entry.findall('{http://www.w3.org/2005/Atom}author')]
        }
        papers.append(paper)
    return papers

def search_semantic_scholar(query: str, max_results: int = 3) -> List[Dict[str, Any]]:
    """Searches the Semantic Scholar API."""
    base_url = 'https://api.semanticscholar.org/graph/v1/paper/search'
    params = {'query': query, 'limit': max_results, 'fields': 'title,url,abstract,authors'}
    
    logger.info(f"Querying Semantic Scholar with: {query}")
    response = requests.get(base_url, params=params, timeout=10)
    response.raise_for_status()
    
    data = response.json()
    papers = []
    if 'data' in data:
        for item in data['data']:
            paper = {
                'source': 'Semantic Scholar',
                'title': item.get('title'),
                'url': item.get('url'),
                'summary': item.get('abstract'),
                'authors': [author['name'] for author in item.get('authors', []) if 'name' in author]
            }
            papers.append(paper)
    return papers

def search_all_apis(query: str, max_results_per_api: int = 3) -> List[Dict[str, Any]]:
    """Searches all configured academic APIs and aggregates results."""
    all_results = []
    
    api_functions = {
        'ArXiv': search_arxiv,
        'Semantic Scholar': search_semantic_scholar
    }
    
    for api_name, search_func in api_functions.items():
        try:
            results = search_func(query, max_results=max_results_per_api)
            all_results.extend(results)
            logger.info(f"Found {len(results)} results from {api_name}.")
        except Exception as e:
            logger.warning(f"Could not retrieve results from {api_name}: {e}")
            
    # Simple de-duplication based on title to avoid showing the same paper from two sources
    unique_results = {paper['title'].lower(): paper for paper in all_results if paper.get('title')}.values()
    
    return list(unique_results)
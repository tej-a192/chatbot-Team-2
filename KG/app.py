import os
import json
import logging
from flask import Flask, request, jsonify
import kg_V4
from dotenv import load_dotenv
from flask_cors import CORS

# Setup logging (reuse your config if needed)
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Initialize Flask app
app = Flask(__name__)

# Enable CORS for all routes
CORS(app)

# Load environment variables
# Load environment variables from .env file
load_dotenv()


@app.route("/start-kg", methods=["POST"])
def start_kg():
    try:
        data = request.get_json()
        filename = data.get("filename")
        username = data.get("username")
        text = data.get("text")

        if not all([filename, username, text]):
            logger.error("Missing one or more required fields: filename, username, text")
            return jsonify({"error": "Missing one or more required fields: filename, username, text"}), 400

        # Generate the KG
        kg_json = kg_V4.generate_kg_from_text(text)

        # # Save KG to output directory
        # output_dir = os.path.join("Notebook", "backend", "kg_outputs", username)
        # os.makedirs(output_dir, exist_ok=True)
        # output_path = os.path.join(output_dir, f"{filename}.json")

        # with open(output_path, "w", encoding="utf-8") as f:
        #     json.dump(kg_json, f, indent=2, ensure_ascii=False)

        # logger.info(f"KG generated and saved to {output_path}")
        # return jsonify({
        #     "message": "KG generated successfully",
        #     "path": output_path
        # }), 200

        return jsonify({
            "message": "KG generated successfully",
            "kg_json": kg_json,
            "username": username,
            "filename": filename
        }), 200

    except Exception as e:
        logger.error(f"Failed to generate KG: {e}", exc_info=True)
        return jsonify({"error": f"Failed to generate KG: {str(e)}"}), 500

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=8001, debug=True)
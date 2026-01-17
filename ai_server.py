from flask import Flask, request, jsonify
import cv2
import numpy as np
import base64
import importlib
import sys
import os
import logging
import time

# Configure Logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')

app = Flask(__name__)

# GLOBALS
LOADED_MODULES = {}
MODULES_PATH = os.path.join(os.path.dirname(__file__), "modules")

def load_module(module_name):
    """Dynamically load an AI module."""
    if module_name in LOADED_MODULES:
        return LOADED_MODULES[module_name]

    try:
        logging.info(f"Loading module: {module_name}")
        # Ensure modules directory is in path
        if MODULES_PATH not in sys.path:
            sys.path.append(MODULES_PATH)

        # Import (e.g., modules.ai_small)
        mod = importlib.import_module(f"modules.{module_name}")
        
        # Instantiate
        if hasattr(mod, "AIModule"):
            instance = mod.AIModule()
            LOADED_MODULES[module_name] = instance
            logging.info(f"Module {module_name} loaded successfully.")
            return instance
        else:
            logging.error(f"Module {module_name} does not have AIModule class.")
            return None
    except Exception as e:
        logging.error(f"Failed to load module {module_name}: {e}")
        return None

@app.route('/status', methods=['GET'])
def status():
    return jsonify({"status": "online", "modules": list(LOADED_MODULES.keys())})

@app.route('/detect', methods=['POST'])
def detect():
    try:
        data = request.json
        image_b64 = data.get("image")
        module_name = data.get("module", "ai_small")

        if not image_b64:
            return jsonify({"error": "No image provided"}), 400

        # Decode Image
        try:
            # Handle data URI scheme if present
            if "," in image_b64:
                image_b64 = image_b64.split(",")[1]
            
            image_bytes = base64.b64decode(image_b64)
            nparr = np.frombuffer(image_bytes, np.uint8)
            frame = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            
            if frame is None:
                return jsonify({"error": "Failed to decode image"}), 400
        except Exception as e:
            return jsonify({"error": f"Image processing failed: {str(e)}"}), 400

        # Load/Get Module
        ai_module = load_module(module_name)
        if not ai_module:
            # Fallback to ai_small if requested one fails?
            if module_name != "ai_small":
                logging.warning(f"Fallback to ai_small from {module_name}")
                ai_module = load_module("ai_small")
            
            if not ai_module:
                return jsonify({"error": f"Module {module_name} not found and fallback failed"}), 500

        # Run Detection
        start_time = time.time()
        detections = ai_module.detect(frame)
        duration = time.time() - start_time

        logging.info(f"Analyzed frame with {module_name}: {len(detections)} detections in {duration:.3f}s")

        return jsonify({
            "module": module_name,
            "count": len(detections),
            "detections": detections,
            "duration": duration
        })

    except Exception as e:
        logging.error(f"Detection Error: {e}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Listen on all interfaces, port 5001
    app.run(host='0.0.0.0', port=5001)

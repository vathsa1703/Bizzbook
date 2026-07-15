import sys
import json
import logging
import os

# Suppress paddle logs
logging.getLogger('ppocr').setLevel(logging.ERROR)
os.environ['GLOG_minloglevel'] = '2'

try:
    from paddleocr import PaddleOCR
    # Use lightweight models
    ocr = PaddleOCR(use_angle_cls=True, lang='en', show_log=False)
    
    image_path = sys.argv[1]
    result = ocr.ocr(image_path, cls=True)
    
    extracted_text = []
    if result is not None and len(result) > 0 and result[0] is not None:
        for line in result[0]:
            extracted_text.append(line[1][0])
            
    print(json.dumps({"success": True, "text": "\n".join(extracted_text)}))
except Exception as e:
    print(json.dumps({"success": False, "error": str(e)}))

import cv2
import sys
import json
import numpy as np

def analyze_motion(frame1_path, frame2_path, roi_points, min_area_percent, padding_percent, output_path):
    try:
        # 1. Load Images
        img1 = cv2.imread(frame1_path)
        img2 = cv2.imread(frame2_path)
        
        if img1 is None or img2 is None:
            print(json.dumps({"error": "Failed to load images"}))
            return

        h, w = img1.shape[:2]
        total_pixels = h * w
        min_pixels = total_pixels * (min_area_percent / 100.0)

        # 2. Preprocessing & Difference
        gray1 = cv2.cvtColor(img1, cv2.COLOR_BGR2GRAY)
        gray2 = cv2.cvtColor(img2, cv2.COLOR_BGR2GRAY)
        
        # Blur to remove noise
        gray1 = cv2.GaussianBlur(gray1, (21, 21), 0)
        gray2 = cv2.GaussianBlur(gray2, (21, 21), 0)

        # Frame Delta
        delta = cv2.absdiff(gray1, gray2)
        thresh = cv2.threshold(delta, 25, 255, cv2.THRESH_BINARY)[1]
        thresh = cv2.dilate(thresh, None, iterations=2)

        # 3. Find Contours
        contours, _ = cv2.findContours(thresh.copy(), cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        valid_boxes = []
        
        # Prepare ROI Polygon for testing
        has_roi = len(roi_points) > 2
        roi_np = None
        if has_roi:
             roi_np = np.array(roi_points, dtype=np.int32)
             # Rescale ROI if needed (assuming ROI points are relative 0-1 or absolute match)
             # If points are relative (0-1), scale by W,H
             # Assuming incoming points are [x,y] absolute matching the resolution
             pass

        for c in contours:
            if cv2.contourArea(c) < min_pixels:
                continue

            (x, y, bw, bh) = cv2.boundingRect(c)
            
            # center point
            cx = x + bw // 2
            cy = y + bh // 2

            # 4. ROI Intersection Check
            if has_roi:
                # measureDist=False returns +1 (inside), -1 (outside), 0 (edge)
                if cv2.pointPolygonTest(roi_np, (cx, cy), False) < 0:
                    continue

            valid_boxes.append((x, y, bw, bh))

        if not valid_boxes:
            print(json.dumps({"motion": False, "reason": "No valid motion in ROI"}))
            return

        # 5. Merge BBoxes (Simple Union of all valid motion)
        # We want one crop containing all relevant motion, or top 3?
        # Standard: Union of all valid boxes
        min_x = min([b[0] for b in valid_boxes])
        min_y = min([b[1] for b in valid_boxes])
        max_x = max([b[0] + b[2] for b in valid_boxes])
        max_y = max([b[1] + b[3] for b in valid_boxes])

        bx, by = min_x, min_y
        bw, bh = max_x - min_x, max_y - min_y

        # 6. Expand (Padding) & Square up context
        pad_w = int(bw * (padding_percent / 100.0))
        pad_h = int(bh * (padding_percent / 100.0))

        # Apply padding
        bx = max(0, bx - pad_w)
        by = max(0, by - pad_h)
        bw = min(w - bx, bw + (pad_w * 2))
        bh = min(h - by, bh + (pad_h * 2))

        # 7. Crop
        crop_img = img2[by:by+bh, bx:bx+bw]

        # 8. Save
        cv2.imwrite(output_path, crop_img)

        print(json.dumps({
            "motion": True,
            "crop_path": output_path,
            "bbox": [bx, by, bw, bh],
            "original_res": [w, h],
            "crop_res": [bw, bh]
        }))

    except Exception as e:
        print(json.dumps({"error": str(e)}))

if __name__ == "__main__":
    if len(sys.argv) < 7:
        print(json.dumps({"error": "Missing args"}))
        sys.exit(1)
        
    f1 = sys.argv[1]
    f2 = sys.argv[2]
    # Parse JSON args
    try:
        roi = json.loads(sys.argv[3])
        min_area = float(sys.argv[4])
        padding = float(sys.argv[5])
        out = sys.argv[6]
        
        analyze_motion(f1, f2, roi, min_area, padding, out)
    except Exception as e:
        print(json.dumps({"error": "Arg parse error: " + str(e)}))

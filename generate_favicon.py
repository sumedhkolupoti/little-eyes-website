from PIL import Image
import os

def create_favicon(source_path, target_path, size=(64, 1.0)): # size is (pixels, padding_factor)
    if not os.path.exists(source_path):
        print(f"Source {source_path} not found")
        return

    img = Image.open(source_path)
    
    # Create a square white background
    side = max(img.width, img.height)
    new_img = Image.new("RGBA", (side, side), (255, 255, 255, 0))
    
    # Center the logo on the square canvas
    offset = ((side - img.width) // 2, (side - img.height) // 2)
    new_img.paste(img, offset)
    
    # Resize to standard favicon size
    final_img = new_img.resize((64, 64), Image.Resampling.LANCZOS)
    final_img.save(target_path)
    print(f"Favicon created at {target_path}")

if __name__ == "__main__":
    create_favicon("public/logo.png", "public/favicon.png")

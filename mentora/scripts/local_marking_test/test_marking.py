import os
import sys
import time
import torch
from PIL import Image

def run_test():
    print("=== Mentora Local Marking Model Test ===")
    
    # Check device
    if torch.backends.mps.is_available():
        device = "mps"
        print("✓ Apple Silicon Metal (MPS) GPU acceleration is active!")
    elif torch.cuda.is_available():
        device = "cuda"
        print("✓ CUDA GPU acceleration active!")
    else:
        device = "cpu"
        print("⚠ Falling back to CPU")

    from diffusers import AutoPipelineForImage2Image

    # We use SDXL-Turbo for near-instant (1-4 steps) high-res generation on Apple Silicon
    model_id = "stabilityai/sdxl-turbo"
    print(f"Loading model: {model_id} (fp16 on {device})...")
    start_load = time.time()
    
    pipe = AutoPipelineForImage2Image.from_pretrained(
        model_id,
        torch_dtype=torch.float16,
        variant="fp16"
    )
    pipe = pipe.to(device)
    
    # Enable memory optimizations for Mac
    try:
        pipe.enable_attention_slicing()
    except Exception:
        pass

    print(f"✓ Model loaded in {time.time() - start_load:.1f}s")

    # Load sample student paper
    input_path = "/Users/admin/Desktop/Malvern/Malvern /Projects/Mentora-/Mentora/assets/images/sample_student_answer.jpg"
    if not os.path.exists(input_path):
        input_path = os.path.abspath("assets/images/sample_student_answer.jpg")
    
    print(f"Loading student paper: {input_path}")
    init_image = Image.open(input_path).convert("RGB")
    
    # Resize to standard A4 ratio dimension divisible by 8 for SDXL (e.g. 768 x 1024 or 896 x 1152)
    orig_w, orig_h = init_image.size
    target_w, target_h = 768, 1024
    init_image_resized = init_image.resize((target_w, target_h), Image.Resampling.LANCZOS)

    prompt = (
        "authentic teacher marking in red ballpoint ink on examination paper, "
        "red checkmarks next to answers, neat red ink corrections, marks circled in red, "
        "handwritten red pen examiner notes in margins, realistic paper texture, crisp scan"
    )

    output_dir = os.path.dirname(os.path.abspath(__file__))
    
    # Test different strengths: 
    # At lower strength (0.22 - 0.28), original student handwriting is strictly preserved
    strengths = [0.22, 0.28, 0.35]
    
    for str_val in strengths:
        print(f"\nGenerating marked paper with strength={str_val} (preserving ~{int((1-str_val)*100)}% of original paper)...")
        t0 = time.time()
        
        # SDXL-Turbo needs only 2 to 4 steps with guidance_scale=0.0 or 1.0
        result = pipe(
            prompt=prompt,
            image=init_image_resized,
            strength=str_val,
            guidance_scale=1.2,
            num_inference_steps=4
        ).images[0]
        
        elapsed = time.time() - t0
        print(f"✓ Generated in {elapsed:.2f} seconds!")
        
        # Save output
        out_file = os.path.join(output_dir, f"marked_test_strength_{int(str_val*100)}.jpg")
        result.save(out_file, quality=95)
        print(f"Saved: {out_file}")

    print("\n=== Test Complete! All test images saved. ===")

if __name__ == "__main__":
    run_test()

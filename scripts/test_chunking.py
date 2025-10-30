#!/usr/bin/env python3
"""Test script to verify paragraph-aware chunking works correctly"""

test_text = """
Growing Stronger is a comprehensive strength training program. It was developed by experts at CDC and Tufts University.

The program includes 12 different exercises. Each exercise targets specific muscle groups. You should perform exercises 2-3 times per week.

Safety is paramount. Always warm up before starting. Listen to your body and rest when needed.

Benefits include:
- Increased muscle strength
- Better bone density
- Improved balance
- Enhanced mental health

Remember to track your progress using the workout log. Consistency is key to seeing results.
"""

# Simulate the recursive chunking algorithm
def chunk_text_recursive(text: str, max_tokens: int = 100, overlap: int = 20) -> list:
    """Simplified version of _chunk_text_recursive for testing"""
    if not text.strip():
        return []
    
    # Split by natural boundaries
    seps = ["\n\n", "\n", ". ", " "]
    
    def length_in_tokens(s: str) -> int:
        # Rough approximation: 1 token ≈ 4 chars
        return max(1, len(s) // 4)
    
    def split_recursive(s: str, sep_index: int) -> list:
        if length_in_tokens(s) <= max_tokens or sep_index >= len(seps):
            return [s]
        
        parts = s.split(seps[sep_index])
        out = []
        buf = ""
        
        for part in parts:
            piece = (buf + (seps[sep_index] if buf else "") + part).strip()
            if length_in_tokens(piece) > max_tokens and buf:
                out.extend(split_recursive(buf.strip(), sep_index + 1))
                buf = part
            else:
                buf = piece
        
        if buf:
            out.extend(split_recursive(buf.strip(), sep_index + 1))
        
        return out
    
    return [c for c in split_recursive(text, 0) if c.strip()]


# Test the chunking
chunks = chunk_text_recursive(test_text, max_tokens=100, overlap=20)

print("=" * 80)
print(f"CHUNKING TEST RESULTS")
print("=" * 80)
print(f"Total chunks: {len(chunks)}\n")

for i, chunk in enumerate(chunks, 1):
    starts_clean = chunk[0].isupper() or chunk[0].isdigit() or chunk[0] in '#-*•['
    ends_clean = chunk[-1] in '.!?:' or chunk.endswith('\n')
    
    print(f"Chunk {i}:")
    print(f"  Length: {len(chunk)} chars (~{len(chunk)//4} tokens)")
    print(f"  Starts clean: {'✅' if starts_clean else '❌'} (first char: '{chunk[0]}')")
    print(f"  Ends clean: {'✅' if ends_clean else '❌'} (last char: '{chunk[-1]}')")
    print(f"  Preview: {chunk[:80]}...")
    print()

# Summary
starts_clean_count = sum(1 for c in chunks if c[0].isupper() or c[0].isdigit() or c[0] in '#-*•[')
ends_clean_count = sum(1 for c in chunks if c[-1] in '.!?:' or c.endswith('\n'))

print("=" * 80)
print(f"SUMMARY:")
print(f"  Clean starts: {starts_clean_count}/{len(chunks)} ({starts_clean_count*100//len(chunks)}%)")
print(f"  Clean ends: {ends_clean_count}/{len(chunks)} ({ends_clean_count*100//len(chunks)}%)")
print("=" * 80)

if starts_clean_count == len(chunks) and ends_clean_count >= len(chunks) * 0.8:
    print("\n✅ CHUNKING LOOKS GOOD! Splits at natural boundaries.")
else:
    print("\n❌ CHUNKING HAS ISSUES - some mid-sentence splits detected")


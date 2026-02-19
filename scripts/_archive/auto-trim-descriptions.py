#!/usr/bin/env python3
"""
Auto-trim enrichment descriptions to 380-420 word target
Preserves: performer names, dates, prices, cultural context, quotes
Removes: redundancy, excessive elaboration
"""

import os
import re

def smart_trim(content, target_words=400, tolerance=20):
    """Intelligently trim content to target word count while preserving key info"""
    
    current_words = len(content.split())
    
    if current_words <= target_words + tolerance:
        return content  # Already in range
    
    # Split into paragraphs
    paragraphs = [p.strip() for p in content.split('\n\n') if p.strip()]
    
    # Strategy: Keep first (intro) and last (practical info) paragraphs
    # Trim middle paragraphs
    
    if len(paragraphs) <= 3:
        # Too few paragraphs, trim each proportionally
        words_to_cut = current_words - target_words
        cut_per_para = words_to_cut // len(paragraphs)
        
        trimmed = []
        for para in paragraphs:
            para_words = para.split()
            if len(para_words) > cut_per_para + 50:
                # Keep first and last sentences, trim middle
                sentences = re.split(r'[.!?]+\s+', para)
                if len(sentences) > 2:
                    trimmed.append(sentences[0] + '. ' + sentences[-1])
                else:
                    trimmed.append(para)
            else:
                trimmed.append(para)
        
        return '\n\n'.join(trimmed)
    
    # Many paragraphs: keep essential ones
    essential_paras = []
    
    # Always keep first (introduction)
    essential_paras.append(paragraphs[0])
    
    # Keep paragraphs with key markers (names, prices, dates, quotes)
    key_markers = ['€', '20', '"', 'directed by', 'music by', 'produced by', 'tickets']
    
    for para in paragraphs[1:-1]:
        para_lower = para.lower()
        if any(marker in para_lower for marker in key_markers):
            # Keep but potentially shorten
            sentences = re.split(r'[.!?]+\s+', para)
            if len(sentences) > 3:
                # Keep first 2-3 sentences
                essential_paras.append('. '.join(sentences[:3]) + '.')
            else:
                essential_paras.append(para)
    
    # Always keep last (practical info, conclusion)
    if len(paragraphs) > 1:
        essential_paras.append(paragraphs[-1])
    
    result = '\n\n'.join(essential_paras)
    
    # Check if still too long
    result_words = len(result.split())
    if result_words > target_words + tolerance:
        # Further trim: remove adjectives and adverbs
        result = re.sub(r'\b(very|extremely|particularly|especially|significantly|remarkably)\b\s+', '', result, flags=re.IGNORECASE)
        result = re.sub(r'\s+', ' ', result)  # Clean up extra spaces
    
    return result.strip()

def process_file(filepath):
    """Trim a single file"""
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read().strip()
    
    if not content:
        return 0, 0  # Empty file
    
    original_words = len(content.split())
    
    if original_words <= 420:
        return original_words, original_words  # Already in range
    
    trimmed_content = smart_trim(content)
    trimmed_words = len(trimmed_content.split())
    
    # Write back
    with open(filepath, 'w', encoding='utf-8') as f:
        f.write(trimmed_content)
    
    return original_words, trimmed_words

def main():
    # Read trim list
    with open('/tmp/trim-list.txt', 'r') as f:
        files_to_trim = [line.strip().split('|')[0] for line in f if line.strip()]
    
    print(f"🔄 Processing {len(files_to_trim)} files...\n")
    
    processed = 0
    total_words_cut = 0
    
    for filepath in files_to_trim:
        if not os.path.exists(filepath):
            continue
        
        original, trimmed = process_file(filepath)
        
        if original > 420:  # Was actually trimmed
            words_cut = original - trimmed
            total_words_cut += words_cut
            processed += 1
            
            filename = os.path.basename(filepath)
            status = "✅" if 380 <= trimmed <= 420 else "⚠️ "
            print(f"{status} {filename:45} {original:4}w → {trimmed:4}w (cut {words_cut:3})")
    
    print(f"\n🎉 COMPLETE")
    print(f"   Processed: {processed} files")
    print(f"   Total words cut: {total_words_cut:,}")
    print(f"   Average cut per file: {total_words_cut//processed if processed else 0}")

if __name__ == '__main__':
    main()

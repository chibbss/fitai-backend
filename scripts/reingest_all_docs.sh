#!/bin/bash
set -e

echo "=========================================="
echo "RE-INGESTING ALL DOCUMENTS WITH NEW CHUNKING"
echo "=========================================="
echo ""

# Colors
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

# Check if we're in the right directory
if [ ! -f "rag.py" ]; then
    echo -e "${RED}❌ Error: Must run from fitai-backend root directory${NC}"
    exit 1
fi

# Verify new config
echo -e "${YELLOW}📋 Checking chunking configuration...${NC}"
python -c "import os; from dotenv import load_dotenv; load_dotenv(); print(f'CHUNKING_MODE: {os.getenv(\"CHUNKING_MODE\", \"NOT SET\")}'); print(f'CHUNK_SIZE_TOKENS: {os.getenv(\"CHUNK_SIZE_TOKENS\", \"NOT SET\")}'); print(f'CHUNK_OVERLAP_TOKENS: {os.getenv(\"CHUNK_OVERLAP_TOKENS\", \"NOT SET\")}')" || {
    echo -e "${RED}❌ Failed to load config${NC}"
    exit 1
}

echo ""
read -p "⚠️  This will DELETE all existing chunks and documents. Continue? (yes/no): " confirm
if [ "$confirm" != "yes" ]; then
    echo "Cancelled."
    exit 0
fi

echo ""
echo -e "${YELLOW}🗑️  Deleting existing chunks and documents...${NC}"

# Delete all chunks and documents from database
python -c "
import os
from sqlalchemy import create_engine, text
from dotenv import load_dotenv

load_dotenv()
engine = create_engine(os.getenv('DATABASE_URL'))

with engine.connect() as conn:
    # Delete in correct order due to foreign keys
    result = conn.execute(text('DELETE FROM chunks'))
    chunks_deleted = result.rowcount
    
    result = conn.execute(text('DELETE FROM documents'))
    docs_deleted = result.rowcount
    
    conn.commit()
    
    print(f'✅ Deleted {chunks_deleted} chunks and {docs_deleted} documents')
" || {
    echo -e "${RED}❌ Failed to delete existing data${NC}"
    exit 1
}

echo ""
echo -e "${GREEN}✅ Database cleared successfully${NC}"
echo ""
echo -e "${YELLOW}📥 Re-ingesting documents...${NC}"
echo ""

# Re-ingest all documents with proper metadata
# Note: Adjust paths as needed if your PDFs are named differently

# 1. Nutrition (NCBI) - already ingested, skip or re-ingest if path known
# 2. Physical Activity (HHS) - already ingested
# 3. Physical Activity (WHO) - already ingested
# 4. Motivation (SDT) - already ingested
# 5. Nutrition (USDA-HHS) - already ingested
# 6. Strength Training (ACSM) - already ingested

# Re-ingest all documents with proper URLs

echo -e "${YELLOW}📄 1/8 - Nutrition for Nurses (NCBI)...${NC}"
python scripts/ingest_local_docs.py \
    "data/pdfs/Nutrition_for_Nurses-WEB.pdf" \
    --category kb \
    --url "https://www.ncbi.nlm.nih.gov/" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 2/8 - Physical Activity Guidelines (HHS)...${NC}"
python scripts/ingest_local_docs.py \
    "data/pdfs/Physical_Activity_Guidelines_2nd_edition.pdf" \
    --category kb \
    --url "https://health.gov/paguidelines/second-edition/" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 3/8 - WHO Physical Activity Recommendations...${NC}"
python scripts/ingest_local_docs.py \
    "data/pdfs/WHO_Global_recommendation_physical_acivity.pdf" \
    --category kb \
    --url "https://www.who.int/publications/" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 4/8 - Self-Determination Theory (SDT)...${NC}"
python scripts/ingest_local_docs.py \
    "data/pdfs/2000_RyanDeci_Self_Determination_Theory.pdf" \
    --category kb \
    --url "https://selfdeterminationtheory.org/" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 5/8 - ACSM Resistance Training...${NC}"
python scripts/ingest_local_docs.py \
    "data/pdfs/resistance-training-ACSM.pdf" \
    --category kb \
    --url "https://www.acsm.org/education-resources/books/position-stands" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 6/8 - Clemson Fitness Handbook...${NC}"
python scripts/ingest_local_docs.py \
    "data/pdfs/fitness-handbook.pdf" \
    --category kb \
    --url "https://www.clemson.edu/business/academics/army-rotc/documents/fitness-handbook.pdf" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 7/8 - Concepts of Fitness and Wellness...${NC}"
python scripts/ingest_local_docs.py \
    "data/pdfs/10 Concepts of fitness and wellness 2nd education.pdf" \
    --category kb \
    --url "https://www.tnteu.ac.in/pdf/library/10%20Concepts%20of%20fitness%20and%20wellness%202nd%20education.pdf" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 8/8 - Growing Stronger (CDC/Tufts)...${NC}"
python scripts/ingest_local_docs.py \
    "data/pdfs/strengh training for older adults.pdf" \
    --category kb \
    --url "https://www.cdc.gov/physicalactivity/downloads/growing_stronger.pdf" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo "=========================================="
echo -e "${GREEN}✅ RE-INGESTION COMPLETE${NC}"
echo "=========================================="
echo ""
echo "Next steps:"
echo "1. Run SQL queries to verify chunk quality"
echo "2. Re-ingest any remaining documents from data/pdfs/"
echo "3. Update metadata (subcategories, sources) as needed"
echo ""


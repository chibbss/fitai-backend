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

# Detect Python command (prefer venv if available)
if [ -f "venv/bin/python" ]; then
    PYTHON="venv/bin/python"
elif command -v python3 &> /dev/null; then
    PYTHON="python3"
elif command -v python &> /dev/null; then
    PYTHON="python"
else
    echo -e "${RED}❌ Error: Python not found${NC}"
    exit 1
fi

echo -e "${YELLOW}Using Python: $PYTHON${NC}"

# Verify new config
echo -e "${YELLOW}📋 Checking chunking configuration...${NC}"
$PYTHON -c "import os; from dotenv import load_dotenv; load_dotenv(); print(f'CHUNKING_MODE: {os.getenv(\"CHUNKING_MODE\", \"NOT SET\")}'); print(f'CHUNK_SIZE_TOKENS: {os.getenv(\"CHUNK_SIZE_TOKENS\", \"NOT SET\")}'); print(f'CHUNK_OVERLAP_TOKENS: {os.getenv(\"CHUNK_OVERLAP_TOKENS\", \"NOT SET\")}')" || {
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
$PYTHON -c "
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

echo -e "${YELLOW}📄 1/9 - Nutrition for Nurses (NCBI)...${NC}"
$PYTHON scripts/ingest_local_docs.py \
    "data/pdfs/Nutrition_for_Nurses-WEB.pdf" \
    --category kb \
    --url "https://www.ncbi.nlm.nih.gov/" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 2/9 - Physical Activity Guidelines (HHS)...${NC}"
$PYTHON scripts/ingest_local_docs.py \
    "data/pdfs/Physical_Activity_Guidelines_2nd_edition.pdf" \
    --category kb \
    --url "https://health.gov/paguidelines/second-edition/" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 3/9 - WHO Physical Activity Recommendations...${NC}"
$PYTHON scripts/ingest_local_docs.py \
    "data/pdfs/WHO_Global_recommendation_physical_acivity.pdf" \
    --category kb \
    --url "https://www.who.int/publications/" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 4/9 - Self-Determination Theory (SDT)...${NC}"
$PYTHON scripts/ingest_local_docs.py \
    "data/pdfs/2000_RyanDeci_Self_Determination_Theory.pdf" \
    --category kb \
    --url "https://selfdeterminationtheory.org/" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 5/9 - ACSM Resistance Training...${NC}"
$PYTHON scripts/ingest_local_docs.py \
    "data/pdfs/resistance-training-ACSM.pdf" \
    --category kb \
    --url "https://www.acsm.org/education-resources/books/position-stands" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 6/9 - USDA Dietary Guidelines...${NC}"
$PYTHON scripts/ingest_local_docs.py \
    "data/pdfs/dietary guidelines for americans 2020-2025.pdf" \
    --category kb \
    --url "https://www.dietaryguidelines.gov/" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 7/9 - Clemson Fitness Handbook...${NC}"
$PYTHON scripts/ingest_local_docs.py \
    "data/pdfs/fitness-handbook.pdf" \
    --category kb \
    --url "https://www.clemson.edu/business/academics/army-rotc/documents/fitness-handbook.pdf" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 8/9 - Concepts of Fitness and Wellness...${NC}"
$PYTHON scripts/ingest_local_docs.py \
    "data/pdfs/10 Concepts of fitness and wellness 2nd education.pdf" \
    --category kb \
    --url "https://www.tnteu.ac.in/pdf/library/10%20Concepts%20of%20fitness%20and%20wellness%202nd%20education.pdf" && echo -e "${GREEN}✅ Done${NC}" || echo -e "${RED}❌ Failed${NC}"

echo ""
echo -e "${YELLOW}📄 9/9 - Growing Stronger (CDC/Tufts)...${NC}"
$PYTHON scripts/ingest_local_docs.py \
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


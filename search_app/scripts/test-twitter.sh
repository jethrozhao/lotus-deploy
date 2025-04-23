#!/bin/bash

# Default values
QUERY="test"
MAX_RESULTS=10
PORT=3000
TIMEOUT=10

# Parse command line arguments
while [[ $# -gt 0 ]]; do
  case $1 in
    -q|--query)
      QUERY="$2"
      shift 2
      ;;
    -n|--max-results)
      MAX_RESULTS="$2"
      shift 2
      ;;
    -p|--port)
      PORT="$2"
      shift 2
      ;;
    -t|--timeout)
      TIMEOUT="$2"
      shift 2
      ;;
    *)
      echo "Unknown option: $1"
      exit 1
      ;;
  esac
done

echo "Testing Twitter API endpoint with:"
echo "Query: $QUERY"
echo "Max Results: $MAX_RESULTS"
echo "Port: $PORT"
echo "Timeout: $TIMEOUT seconds"
echo ""

curl -X POST "http://localhost:$PORT/api/twitter" \
  -H "Content-Type: application/json" \
  -m $TIMEOUT \
  -d "{\"query\": \"$QUERY\", \"max_results\": $MAX_RESULTS}" | jq

# Check the exit status of curl
CURL_EXIT=$?
if [ $CURL_EXIT -eq 28 ]; then
  echo "Error: Request timed out after $TIMEOUT seconds"
  exit 1
elif [ $CURL_EXIT -ne 0 ]; then
  echo "Error: curl failed with exit code $CURL_EXIT"
  exit 1
fi 
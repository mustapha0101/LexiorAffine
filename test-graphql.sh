curl -X POST -H "Content-Type: application/json" -d '{
  "query": "mutation { claimDocumentIrac(jobId: \"random-id\") { id } }"
}' http://localhost:3010/graphql

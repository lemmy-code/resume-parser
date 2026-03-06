#!/bin/bash
echo "Initializing LocalStack resources..."

REGION=eu-west-1
ENDPOINT=http://localhost:4566

# S3 bucket
awslocal s3 mb s3://resume-parser-uploads --region $REGION
awslocal s3api put-bucket-cors --bucket resume-parser-uploads --cors-configuration '{
  "CORSRules": [
    {
      "AllowedOrigins": ["*"],
      "AllowedMethods": ["PUT", "POST", "GET"],
      "AllowedHeaders": ["*"]
    }
  ]
}'

# SQS DLQ
awslocal sqs create-queue --queue-name resume-processing-dlq --region $REGION

# SQS Queue with DLQ
DLQ_ARN=$(awslocal sqs get-queue-attributes --queue-url http://sqs.eu-west-1.localhost.localstack.cloud:4566/000000000000/resume-processing-dlq --attribute-names QueueArn --query 'Attributes.QueueArn' --output text --region $REGION)

awslocal sqs create-queue \
  --queue-name resume-processing \
  --attributes "{\"VisibilityTimeout\":\"300\",\"RedrivePolicy\":\"{\\\"deadLetterTargetArn\\\":\\\"${DLQ_ARN}\\\",\\\"maxReceiveCount\\\":\\\"3\\\"}\"}" \
  --region $REGION

# DynamoDB table
awslocal dynamodb create-table \
  --table-name resumes \
  --attribute-definitions \
    AttributeName=resumeId,AttributeType=S \
    AttributeName=status,AttributeType=S \
    AttributeName=uploadedAt,AttributeType=S \
  --key-schema \
    AttributeName=resumeId,KeyType=HASH \
  --global-secondary-indexes \
    '[{
      "IndexName": "status-index",
      "KeySchema": [
        {"AttributeName": "status", "KeyType": "HASH"},
        {"AttributeName": "uploadedAt", "KeyType": "RANGE"}
      ],
      "Projection": {"ProjectionType": "ALL"}
    }]' \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION

echo "LocalStack initialization complete!"

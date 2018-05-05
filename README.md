# Log++ -- A Logging Framework for Modern Development

Log++ is a logging framework designed to support modern development needs. The goal is to provide:
1. Very low main-thead cost to log a message (under 1&#x00B5;s per message)
2. Simultanious support for high fidelity diagnostics logging and lower frequency informational logging.
  * High detail debug messages are stored in a high performance in memory buffer and can be emitted on errors 
  for detailed debugging.
  * Informational messages are written out to the stable storage channel for analytics and monitoring applications
3. Structured and machine parsable log output for easy analytics.
4. Unified control of logging levels & output accross modules.

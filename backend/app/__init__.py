# Use the operating system certificate store for outbound HTTPS (organizer API, Gemini).
# certifi alone misses issuers that Windows and corporate networks trust.
try:
    import truststore

    truststore.inject_into_ssl()
except ImportError:  # optional; falls back to certifi
    pass

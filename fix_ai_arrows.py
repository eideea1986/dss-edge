import sys
content = open('/opt/dss-edge/local-api/routes/ai-intelligence.js').read()
content = content.replace('=\\u003e', '=\u003e')
open('/opt/dss-edge/local-api/routes/ai-intelligence.js', 'w').write(content)
print('Fixed AI Intelligence arrows')

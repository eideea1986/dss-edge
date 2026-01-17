import sys
content = open('/opt/dss-hub-api/server.js').read()
content = content.replace('=\\u003e', '=\u003e')
open('/opt/dss-hub-api/server.js', 'w').write(content)
print('Fixed arrow functions')

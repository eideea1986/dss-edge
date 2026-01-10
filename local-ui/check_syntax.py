import re

def check_balance(filepath):
    with open(filepath, 'r', encoding='utf-8') as f:
        content = f.read()

    stack = []
    lines = content.split('\n')
    
    # Remove strings and comments for simplified checking
    # This is a naive removal, real parsing is harder, but should catch basic mismatches
    # We will iterate char by char statefully
    
    in_string = None # ' or " or `
    in_comment = False # //
    in_block_comment = False # /*
    
    for row, line in enumerate(lines):
        line_num = row + 1
        i = 0
        while i < len(line):
            char = line[i]
            
            # Handle Comments/Strings
            if in_block_comment:
                if line[i:i+2] == '*/':
                    in_block_comment = False
                    i += 1
                i += 1
                continue
                
            if in_comment:
                break # Rest of line is comment
                
            if in_string:
                if char == in_string:
                    # Check for escaped quote
                    if i > 0 and line[i-1] == '\\' and (i < 2 or line[i-2] != '\\'):
                        pass
                    else:
                        in_string = None
                i += 1
                continue
                
            # Start of Comment/String
            if line[i:i+2] == '//':
                in_comment = True
                break
            if line[i:i+2] == '/*':
                in_block_comment = True
                i += 2
                continue
                
            if char in ['"', "'", '`']:
                in_string = char
                i += 1
                continue
                
            # Brackets
            if char in ['(', '{', '[']:
                stack.append((char, line_num, i+1))
                
            elif char in [')', '}', ']']:
                if not stack:
                    print(f"Error: Unexpected closing '{char}' at line {line_num}:{i+1}")
                    return
                
                last, last_line, last_col = stack.pop()
                expected = {'(': ')', '{': '}', '[': ']'}[last]
                if char != expected:
                    print(f"Error: Mismatched '{char}' at line {line_num}:{i+1}. Expected '{expected}' to close '{last}' from line {last_line}:{last_col}")
                    return
            
            i += 1
        in_comment = False # Reset single line comment at end of line

    if stack:
        last, last_line, last_col = stack[-1]
        print(f"Error: Unclosed '{last}' from line {last_line}:{last_col}")
    else:
        print("Success: All braces balanced.")

check_balance("i:/dispecerat/edge/local-ui/src/pages/Settings.js")

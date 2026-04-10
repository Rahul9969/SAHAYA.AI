import sys
import json
import io

def execute_and_trace(code_str):
    steps = []
    output_buffer = io.StringIO()
    # Redirect stdout
    old_stdout = sys.stdout
    sys.stdout = output_buffer
    
    # Track call stack
    call_stack = []
    
    def trace_calls_and_returns(frame, event, arg):
        # Limit to 300 steps
        if len(steps) > 300:
            return None

        # Only trace within our executed code
        if frame.f_code.co_filename != "<string>":
            return trace_calls_and_returns
            
        line_no = frame.f_lineno
        func_name = frame.f_code.co_name
        
        # Simple string representation for variables, filter out builtins
        variables = {}
        for k, v in frame.f_locals.items():
            if not k.startswith('__'):
                try:
                    # Provide special styling cues by keeping types intact if possible,
                    # or returning string representations. For SocraticDev mockup, it expects just a value we can display.
                    # We will output repr(v) unless it's a generic object.
                    repr_val = repr(v)
                    # Simple heuristic: if it looks like a function string, let UI color it
                    if "function" in repr_val and " at 0x" in repr_val:
                        variables[k] = f"<function {func_name}>"
                    else:
                        variables[k] = repr_val
                except:
                    variables[k] = "<unrepresentable>"
                    
        action = event
        
        if event == 'call':
            if func_name != '<module>':
                call_stack.append(func_name)
        elif event == 'return':
            pass # pop happens after recording the step
            
        step = {
            "line": line_no,
            "action": event,
            "description": f"{event.capitalize()} statement" if func_name == '<module>' else f"{event.capitalize()} in {func_name}()",
            "variables": variables,
            "callStack": [f"{name}()" for name in call_stack] if call_stack else ["<module>()"],
            "output": output_buffer.getvalue().strip()
        }
        steps.append(step)
        
        if event == 'return' and func_name != '<module>':
            if call_stack:
                call_stack.pop()
                
        return trace_calls_and_returns

    try:
        sys.settrace(trace_calls_and_returns)
        compiled_code = compile(code_str, "<string>", "exec")
        # Ensure __name__ is '__main__' so standard scripts run properly
        exec(compiled_code, {"__name__": "__main__"})
    except Exception as e:
        steps.append({
            "line": getattr(e, 'lineno', 0) or 0,
            "action": "error",
            "description": f"{type(e).__name__}: {str(e)}",
            "variables": {},
            "callStack": [],
            "output": output_buffer.getvalue().strip() + f"\nError: {str(e)}"
        })
    finally:
        sys.settrace(None)
        sys.stdout = old_stdout
        
    return {
        "steps": steps,
        "finalOutput": output_buffer.getvalue().strip()
    }

if __name__ == "__main__":
    try:
        input_data = sys.stdin.read()
        parsed = json.loads(input_data)
        code = parsed.get("code", "")
        if not code:
            print(json.dumps({"error": "No code provided"}))
            sys.exit(1)
            
        trace = execute_and_trace(code)
        print(json.dumps(trace))
    except Exception as ex:
        print(json.dumps({"error": str(ex)}))
        sys.exit(1)

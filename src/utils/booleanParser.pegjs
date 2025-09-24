{
  const alphabet = options.alphabet ?? "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ"
  const isAllowedVar = (symbol) => alphabet.includes(symbol)
}

Expression
  = Add

Add
	= head:Mult tail:("+" right:Mult { return right })* {
			return tail.reduce((left, right) => ({ type: "add", left, right }), head)
		}

Mult
	= head:Not tail:(("*"/"") right:Not { return right })* {
			return tail.reduce((left, right) => ({ type: "multiply", left, right }), head)
		}

Not
	= base:Primary ap:("'")* {
      return ap.reduce((operand, _) => ({ type: "not", operand }), base)
		}

Primary
	= Var
  / True
  / False
  / Paren

Paren "parenthesized expression"
  = "(" e:Expression ")" { return e }

Var "variable"
	= symbol:[a-zA-Z] {
      if (!isAllowedVar(symbol[0])) {
        error(`Variable ${symbol[0]} not in allowed alphabet`)
      } else {
        return { type: "var", symbol }
      }
    }

True "1"
  = "1" { return { type: "true" } }

False "0"
  = "0" { return { type: "false" } }

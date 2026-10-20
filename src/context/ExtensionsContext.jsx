import { createContext, useContext } from "react";

const ExtensionsContext = createContext({});

export function useExtensions() {
  return useContext(ExtensionsContext);
}

export default ExtensionsContext;

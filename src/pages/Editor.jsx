import LayoutContextProvider from "../context/LayoutContext";
import TransformContextProvider from "../context/TransformContext";
import TablesContextProvider from "../context/DiagramContext";
import UndoRedoContextProvider from "../context/UndoRedoContext";
import SelectContextProvider from "../context/SelectContext";
import AreasContextProvider from "../context/AreasContext";
import NotesContextProvider from "../context/NotesContext";
import TypesContextProvider from "../context/TypesContext";
import SaveStateContextProvider from "../context/SaveStateContext";
import EnumsContextProvider from "../context/EnumsContext";
import ViewsContextProvider from "../context/ViewsContext";
import WorkSpace from "../components/Workspace";
import ExtensionsContext from "../context/ExtensionsContext";
import { serverStorage } from "../api/diagrams";
import { useThemedPage } from "../hooks";

export default function Editor() {
  useThemedPage();

  return (
    <LayoutContextProvider>
      <TransformContextProvider>
        <UndoRedoContextProvider>
          <SelectContextProvider>
            <AreasContextProvider>
              <NotesContextProvider>
                <TypesContextProvider>
                  <EnumsContextProvider>
                    <ViewsContextProvider>
                      <TablesContextProvider>
                        <SaveStateContextProvider>
                          <ExtensionsContext.Provider value={serverStorage}>
                            <WorkSpace />
                          </ExtensionsContext.Provider>
                        </SaveStateContextProvider>
                      </TablesContextProvider>
                    </ViewsContextProvider>
                  </EnumsContextProvider>
                </TypesContextProvider>
              </NotesContextProvider>
            </AreasContextProvider>
          </SelectContextProvider>
        </UndoRedoContextProvider>
      </TransformContextProvider>
    </LayoutContextProvider>
  );
}

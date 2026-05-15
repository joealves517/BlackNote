import { Extension } from '@tiptap/core';
import { Plugin, PluginKey } from 'prosemirror-state';
import { Decoration, DecorationSet } from 'prosemirror-view';

export const agentDecorationKey = new PluginKey('agentDecoration');

export const AgentDecorationExtension = Extension.create({
  name: 'agentDecoration',

  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: agentDecorationKey,
        state: {
          init() {
            return DecorationSet.empty;
          },
          apply(tr, set) {
            // Map decorations through document changes to keep them at the right positions
            set = set.map(tr.mapping, tr.doc);

            const action = tr.getMeta(agentDecorationKey);
            if (action) {
              if (action.add) {
                const decos = action.add.map((range: { from: number; to: number }) =>
                  Decoration.inline(range.from, range.to, { class: 'agent-highlight-fake' })
                );
                return set.add(tr.doc, decos);
              }
              if (action.clear) {
                return DecorationSet.empty;
              }
            }
            return set;
          },
        },
        props: {
          decorations(state) {
            return agentDecorationKey.getState(state);
          },
        },
      }),
    ];
  },
});

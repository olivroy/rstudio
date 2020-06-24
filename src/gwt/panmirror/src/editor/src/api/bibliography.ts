/*
 * bibliography.ts
 *
 * Copyright (C) 2020 by RStudio, PBC
 *
 * Unless you have received this program directly from RStudio pursuant
 * to the terms of a commercial license agreement with RStudio, then
 * this program is licensed to you under the terms of version 3 of the
 * GNU Affero General Public License. This program is distributed WITHOUT
 * ANY EXPRESS OR IMPLIED WARRANTY, INCLUDING THOSE OF NON-INFRINGEMENT,
 * MERCHANTABILITY OR FITNESS FOR A PARTICULAR PURPOSE. Please refer to the
 * AGPL (http://www.gnu.org/licenses/agpl-3.0.txt) for more details.
 *
 */
import { Node as ProsemirrorNode } from 'prosemirror-model';
import { PandocServer } from './pandoc';

import Fuse from 'fuse.js';

import { EditorUIContext, EditorUI } from './ui';
import { yamlMetadataNodes, stripYamlDelimeters, toYamlCode, parseYaml } from './yaml';

export interface BibliographyFiles {
  bibliography: string[];
}

export interface BibliographyResult {
  etag: string;
  bibliography: Bibliography;
}

export interface Bibliography {
  sources: BibliographySource[];
  project_biblios: string[];
}

// The individual bibliographic source
export interface BibliographySource {
  id: string;
  type: string;
  DOI?: string;
  URL?: string;
  title?: string;
  author?: BibliographyAuthor[];
  issued?: BibliographyDate;
}

// Author
export interface BibliographyAuthor {
  family?: string;
  given?: string;
  literal?: string;
  name?: string;
}

// Used for issue dates
export interface BibliographyDate {
  'date-parts': Array<[number, number?, number?]>;
  raw?: string;
}

interface ParsedYaml {
  yamlCode: string;
  yaml: any;
}

// The fields and weights that will indexed and searched
// when searching bibliographic sources
const kFields: Fuse.FuseOptionKeyObject[] = [
  { name: 'id', weight: 20 },
  { name: 'author.family', weight: 10 },
  { name: 'author.literal', weight: 10 },
  { name: 'author.given', weight: 1 },
  { name: 'title', weight: 1 },
  { name: 'issued', weight: 1 },
];

export class BibliographyManager {
  private readonly server: PandocServer;
  private etag: string;
  private bibliography: Bibliography | undefined;
  private fuse: Fuse<BibliographySource, Fuse.IFuseOptions<any>> | undefined;

  public constructor(server: PandocServer) {
    this.server = server;
    this.etag = '';
  }

  public async loadBibliography(ui: EditorUI, doc: ProsemirrorNode): Promise<Bibliography> {
    // read the Yaml blocks from the document
    const parsedYamlNodes = parseYamlNodes(doc);

    // Currently edited doc
    const docPath = ui.context.getDocumentPath();

    // Gather the files from the document
    const files = bibliographyFilesFromDoc(parsedYamlNodes, ui.context);

    // Gather the reference block
    const refBlock = referenceBlockFromYaml(parsedYamlNodes);

    if (docPath || files || refBlock) {
      // get the bibliography
      const result = await this.server.getBibliography(docPath, files ? files.bibliography : [], refBlock, this.etag);

      // Read bibliography data from files (via server)
      if (!this.bibliography || result.etag !== this.etag) {
        const sources = result.bibliography.sources;
        const parsedIds = sources.map(source => source.id);

        this.bibliography = result.bibliography;
        this.updateIndex(this.bibliography.sources);
      }

      // record the etag for future queries
      this.etag = result.etag;
    }

    // return sources
    return this.bibliography || { sources: [], project_biblios: [] };
  }

  public search(query: string, limit: number): BibliographySource[] {
    // TODO: If search is called but the server hasn't downloaded, we should 
    // download the data, then index, then search?
    if (this.fuse) {
      const options = {
        isCaseSensitive: false,
        shouldSort: true,
        includeMatches: false,
        includeScore: false,
        limit,
        keys: kFields,
      };
      const results: Array<Fuse.FuseResult<BibliographySource>> = this.fuse.search(query, options);
      return results.map((result: { item: any }) => result.item);
    } else {
      return [];
    }
  }

  private updateIndex(bibSources: BibliographySource[]) {
    // build search index
    const options = {
      keys: kFields.map(field => field.name),
    };
    const index = Fuse.createIndex(options.keys, bibSources);
    this.fuse = new Fuse(bibSources, options, index);
  }
}

function referenceBlockFromYaml(parsedYamls: ParsedYaml[]): string {
  const refBlockParsedYamls = parsedYamls.filter(
    parsedYaml => typeof parsedYaml.yaml === 'object' && parsedYaml.yaml.references,
  );

  // Pandoc will use the last references node when generating a bibliography.
  // So replicate this and use the last biblography node that we find
  if (refBlockParsedYamls.length > 0) {
    const lastReferenceParsedYaml = refBlockParsedYamls[refBlockParsedYamls.length - 1];
    if (lastReferenceParsedYaml) {
      return lastReferenceParsedYaml.yamlCode;
    }
  }

  return '';
}

export function bibliographyPaths(ui: EditorUI, doc: ProsemirrorNode): BibliographyFiles | null {
  // Gather the files from the document
  return bibliographyFilesFromDoc(parseYamlNodes(doc), ui.context);
}

function parseYamlNodes(doc: ProsemirrorNode): ParsedYaml[] {
  const yamlNodes = yamlMetadataNodes(doc);

  const parsedYamlNodes = yamlNodes.map<ParsedYaml>(node => {
    const yamlText = node.node.textContent;
    const yamlCode = stripYamlDelimeters(yamlText);
    return { yamlCode, yaml: parseYaml(yamlCode) };
  });
  return parsedYamlNodes;
}

// TODO: path handling ok here?
function bibliographyFilesFromDoc(parsedYamls: ParsedYaml[], uiContext: EditorUIContext): BibliographyFiles | null {
  const bibliographyParsedYamls = parsedYamls.filter(
    parsedYaml => typeof parsedYaml.yaml === 'object' && parsedYaml.yaml.bibliography,
  );

  // Look through any yaml nodes to see whether any contain bibliography information
  if (bibliographyParsedYamls.length > 0) {
    // Pandoc will use the last biblography node when generating a bibliography.
    // So replicate this and use the last biblography node that we find
    const bibliographyParsedYaml = bibliographyParsedYamls[bibliographyParsedYamls.length - 1];
    const bibliographyFiles = bibliographyParsedYaml.yaml.bibliography;

    if (
      Array.isArray(bibliographyFiles) &&
      bibliographyFiles.every(bibliographyFile => typeof bibliographyFile === 'string')
    ) {
      // An array of bibliographies
      const bibPaths = bibliographyFiles.map(
        bibliographyFile => uiContext.getDefaultResourceDir() + '/' + bibliographyFile,
      );
      return {
        bibliography: bibPaths,
      };
    } else {
      // A single bibliography
      return {
        bibliography: [uiContext.getDefaultResourceDir() + '/' + bibliographyFiles],
      };
    }
  }
  return null;
}

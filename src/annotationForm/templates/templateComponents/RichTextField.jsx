import React from 'react';
import PropTypes from 'prop-types';
import { Box } from '@mui/material';
import { CKEditor } from '@ckeditor/ckeditor5-react';
import {
  Autoformat,
  Bold,
  ClassicEditor,
  CodeBlock,
  Essentials,
  Heading,
  HorizontalLine,
  Italic,
  Link,
  List,
  Paragraph,
  ShowBlocks,
  SpecialCharacters,
  SpecialCharactersEssentials,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TableToolbar,
  Underline,
} from 'ckeditor5';
import 'ckeditor5/ckeditor5.css';

/**
 * Toolbar/heading config mirrors apps/strapi/src/admin/app.tsx's `editorialToolbar` (issue
 * #333: "same config as in Strapi") - a POI's description should read/edit the same way whether
 * staff opens it from the Strapi Content Manager or from this Mirador form. 'showBlocks' and
 * 'specialCharacters' keep their Strapi-side names since they map 1:1 to ShowBlocks/
 * SpecialCharacters below.
 */
const TOOLBAR = [
  'showBlocks', '|',
  'heading', '|',
  'superscript', 'bold', 'italic', 'underline', 'strikethrough', '|',
  'bulletedList', 'numberedList', 'link', 'insertTable', 'codeBlock',
  'specialCharacters', 'horizontalLine', 'subscript', '|',
  'undo', 'redo',
];

const HEADING_OPTIONS = [
  { class: 'ck-heading_paragraph', model: 'paragraph', title: 'Paragraph' },
  {
    class: 'ck-heading_heading2', model: 'heading2', title: 'Heading 2', view: 'h2',
  },
  {
    class: 'ck-heading_heading3', model: 'heading3', title: 'Heading 3', view: 'h3',
  },
  {
    class: 'ck-heading_heading4', model: 'heading4', title: 'Heading 4', view: 'h4',
  },
  {
    class: 'ck-heading_heading5', model: 'heading5', title: 'Heading 5', view: 'h5',
  },
  {
    class: 'ck-heading_heading6', model: 'heading6', title: 'Heading 6', view: 'h6',
  },
];

const PLUGINS = [
  Autoformat,
  Bold,
  CodeBlock,
  Essentials,
  Heading,
  HorizontalLine,
  Italic,
  Link,
  List,
  Paragraph,
  ShowBlocks,
  SpecialCharacters,
  SpecialCharactersEssentials,
  Strikethrough,
  Subscript,
  Superscript,
  Table,
  TableToolbar,
  Underline,
];

/**
 * A CKEditor 5 rich-text field for a POI's per-language description (issue #333). Mounted as a
 * standalone `<CKEditor>` rather than through @_sh/strapi-plugin-ckeditor - that plugin only
 * wires up CKEditor instances inside Strapi's own Content Manager React tree, so this form (a
 * separate Mirador/react-redux tree the maps plugin mounts, see MiradorMaeViewer.tsx) must
 * configure its own instance. `licenseKey: 'GPL'` mirrors the self-hosted/open-source choice
 * apps/strapi/src/admin/app.tsx's CKEditor integration already makes for the same content type.
 *
 * `ckeditor5`/`@ckeditor/ckeditor5-react` are peerDependencies (see vite.config.js's
 * `externalIds`, sourced from package.json), so this reuses whichever single CKEditor5 instance
 * the host app (Strapi's admin bundle, which already loads it for @_sh/strapi-plugin-ckeditor)
 * provides, instead of bundling a second copy - CKEditor5 throws at runtime if two separate
 * copies of its core end up loaded on the same page.
 * @param {(html: string) => void} onChange
 * @param {boolean} rtl - whether the active locale reads right-to-left. Sets CKEditor's own
 *   `language.content` (not just a CSS override), so the editable area's direction and text
 *   alignment follow CKEditor's built-in RTL support the same way Strapi's own CKEditor fields
 *   do for an *Ar field (see apps/strapi/src/admin/rtl-fields.css).
 * @param {string} value - the field's current HTML value
 */
export function RichTextField({ onChange, rtl, value }) {
  return (
    <Box
      sx={{
        '& .ck-editor__editable': { minHeight: '150px' },
      }}
    >
      <CKEditor
        config={{
          heading: { options: HEADING_OPTIONS },
          language: { content: rtl ? 'ar' : 'en', ui: 'en' },
          licenseKey: 'GPL',
          plugins: PLUGINS,
          toolbar: TOOLBAR,
        }}
        data={value}
        editor={ClassicEditor}
        onChange={(_event, editor) => onChange(editor.getData())}
      />
    </Box>
  );
}

RichTextField.propTypes = {
  onChange: PropTypes.func.isRequired,
  rtl: PropTypes.bool,
  value: PropTypes.string,
};

RichTextField.defaultProps = {
  rtl: false,
  value: '',
};

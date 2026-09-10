import React from 'react';
import SvgIcon from '@mui/material/SvgIcon';

/**
 * PoiIcon - a location pin with a bullseye, distinguishing a point of interest (a precisely
 * marked spot) from MUI's generic Place pin (issue #333: "use a more relevant POI icon").
 */
export default function PoiIcon(props) {
  return (
    // eslint-disable-next-line react/jsx-props-no-spreading
    <SvgIcon {...props}>
      <svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
        <path
          clipRule="evenodd"
          d="M12 2C8.14 2 5 5.14 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.86-3.14-7-7-7zm0 4a3 3 0 1 1 0 6 3 3 0 0 1 0-6z"
          fill="currentColor"
          fillRule="evenodd"
        />
        <circle cx="12" cy="9" fill="currentColor" r="1.15" />
      </svg>
    </SvgIcon>
  );
}

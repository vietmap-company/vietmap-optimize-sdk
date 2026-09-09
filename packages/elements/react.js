// React entry point. Importing '@vietmap/optimize-sdk-elements/react' both
// registers the custom elements (the side effect below) and, via the sibling
// react.d.ts, teaches React's JSX about the tags — so a React app needs just
// this one side-effect import plus its type imports. Everything from the main
// entry is re-exported here too, so types can come from this same path.
import '@vietmap/optimize-sdk-elements'
export * from '@vietmap/optimize-sdk-elements'

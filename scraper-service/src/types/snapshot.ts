/*A single "observation" of a website at
 a specific point in time. Every time 
scraper visits a URL and extracts data, you create a Snapshot record.*/

export interface snapshot {
    id ?: number;
    url : string;
    sitename : string;
    domHash : string; /** SHA‑256 hash of the cleaned DOM structure */
    capturedAt : Date;
    screenshotpath : string;
}
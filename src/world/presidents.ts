// Principals and presidents of the school (term start/end years), from the school's published list.
// Names and years only. Shared by the Manwaring presidents gallery and the campus trivia side quest.
export interface President { name: string; from: number; to: number | null; title: string }

export const PRESIDENTS: President[] = [
  { name: 'Jacob Spori', from: 1888, to: 1891, title: 'Principal' }, { name: 'Charles N. Watkins', from: 1891, to: 1894, title: 'Principal' },
  { name: 'George Cole', from: 1894, to: 1899, title: 'Principal' }, { name: 'Douglas M. Todd', from: 1899, to: 1901, title: 'Principal' },
  { name: 'Ezra C. Dalby', from: 1901, to: 1914, title: 'Principal' }, { name: 'Andrew B. Christenson', from: 1914, to: 1917, title: 'Principal' },
  { name: 'George S. Romney', from: 1917, to: 1931, title: 'President' }, { name: 'Hyrum Manwaring', from: 1931, to: 1944, title: 'President' },
  { name: 'John L. Clarke', from: 1944, to: 1971, title: 'President' }, { name: 'Henry B. Eyring', from: 1971, to: 1977, title: 'President' },
  { name: 'Bruce C. Hafen', from: 1978, to: 1985, title: 'President' }, { name: 'Joe J. Christensen', from: 1985, to: 1989, title: 'President' },
  { name: 'Steven D. Bennion', from: 1989, to: 1997, title: 'President' }, { name: 'David A. Bednar', from: 1997, to: 2004, title: 'President' },
  { name: 'Robert M. Wilkes', from: 2004, to: 2005, title: 'Interim President' }, { name: 'Kim B. Clark', from: 2005, to: 2015, title: 'President' },
  { name: 'Clark G. Gilbert', from: 2015, to: 2017, title: 'President' }, { name: 'Henry J. Eyring', from: 2017, to: 2023, title: 'President' },
  { name: 'Alvin F. Meredith III', from: 2023, to: null, title: 'President' },
];

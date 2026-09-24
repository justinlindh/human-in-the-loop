export const FIRST_NAMES = [
  'Ada', 'Bao', 'Chidi', 'Dana', 'Emeka', 'Farah', 'Gus', 'Hana', 'Ines', 'Jun', 'Kai', 'Leila', 'Mateo', 'Nia',
  'Omar', 'Priya', 'Quinn', 'Rafa', 'Sana', 'Tomas', 'Uma', 'Vik', 'Wren', 'Xiu', 'Yara', 'Zeke', 'Aiko', 'Bram',
  'Cleo', 'Dev', 'Esme', 'Femi', 'Greta', 'Hiro', 'Imani', 'Jonas', 'Kofi', 'Lena', 'Malik', 'Noor', 'Oskar',
  'Paz', 'Rosa', 'Soren', 'Tariq', 'Ulla', 'Vera', 'Wei', 'Ximena', 'Yusuf', 'Zara', 'Amara', 'Beto', 'Chloe',
  'Dmitri', 'Elif', 'Fatima', 'Gael', 'Hye-jin', 'Ivo', 'Jaya', 'Kenji', 'Lucia', 'Mika', 'Nadia', 'Olu', 'Pita',
  'Ravi', 'Sofia', 'Thabo', 'Anouk', 'Bilal', 'Carmen', 'Diego', 'Eun', 'Freya',
];

export const LAST_NAMES = [
  'Abara', 'Becker', 'Chen', 'Diallo', 'Eriksen', 'Fonseca', 'Garcia', 'Haddad', 'Ito', 'Kaur', 'Mensah',
  'Nakamura', 'Okafor', 'Petrov', 'Rossi', 'Santos', 'Tanaka', 'Vargas', 'Walsh', 'Yilmaz', 'Adeyemi', 'Bianchi',
  'Castillo', 'Dubois', 'Esposito', 'Friedman', 'Gonzalez', 'Hoang', 'Iyer', 'Jensen', 'Kim', 'Lindqvist',
  'Moreau', 'Novak', 'Oyelaran', 'Park', 'Quispe', 'Rahman', 'Schmidt', 'Takahashi', 'Ueda', 'Volkov', 'Wojcik',
  'Xu', 'Yamamoto', 'Zhou', 'Afolabi', 'Bergstrom', 'Cruz', 'Dang', 'Ekwueme', 'Fischer', 'Gupta', 'Horvath',
  'Ibrahim', 'Jovanovic', 'Kowalski', 'Lopez', 'Mbeki', 'Nguyen', 'Olsen', 'Patel', 'Ramirez', 'Sato', 'Torres',
  'Oduya', 'Laine',
];

// Which voice set a first name suggests for the audio barks. Names not listed are neutral and may take either.
const FEM = ['Ada', 'Farah', 'Hana', 'Ines', 'Leila', 'Nia', 'Priya', 'Sana', 'Uma', 'Yara', 'Aiko', 'Cleo', 'Esme', 'Greta',
  'Imani', 'Lena', 'Rosa', 'Ulla', 'Vera', 'Ximena', 'Zara', 'Amara', 'Chloe', 'Elif', 'Fatima', 'Hye-jin', 'Jaya', 'Lucia',
  'Nadia', 'Sofia', 'Anouk', 'Carmen', 'Freya', 'Noor'];
const MASC = ['Emeka', 'Gus', 'Mateo', 'Omar', 'Rafa', 'Tomas', 'Vik', 'Zeke', 'Bram', 'Hiro', 'Jonas', 'Kofi', 'Malik', 'Oskar',
  'Soren', 'Tariq', 'Yusuf', 'Beto', 'Dmitri', 'Gael', 'Ivo', 'Kenji', 'Pita', 'Ravi', 'Thabo', 'Bilal', 'Diego'];
export const NAME_VOICE = Object.fromEntries([...FEM.map((n) => [n, 'fem']), ...MASC.map((n) => [n, 'masc'])]);

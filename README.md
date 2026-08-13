# Hutka Online 🇧🇾

Render-ready build of Hutka v4.

## Render
- Runtime: Node
- Build command: `npm install`
- Start command: `npm start`
- Environment variable: `JWT_SECRET` = a long random secret

The server listens on `0.0.0.0` and uses Render's `PORT` environment variable.

## Important
This first online build uses a JSON file for the database and local file storage for images. It is suitable for the first live test, but Render's normal filesystem is not a durable database/storage solution. Before inviting real users, move the database to PostgreSQL and photos to object storage.

Test accounts:
- anya / hutka123
- dzima / hutka123
- volha / hutka123

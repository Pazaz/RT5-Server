# What is this?

This is a small reference server to be able to load [RT5-Client](https://github.com/Pazaz/RT5-Client) and describe the process involved.

## How do I run it?

Server:
```bash
git clone https://github.com/Pazaz/RT5-Server.git
cd RT5-Server
npm install
npm start
```

Client:
```bash
git clone https://github.com/Pazaz/RT5-Client.git
cd RT5-Client
.\gradlew run
```

# Credits

Thank you to Graham for your OpenRS2 archive, that this downloads and caches the client assets from. It isn't intended to abuse your API, but rather to immediately provide a runnable solution.

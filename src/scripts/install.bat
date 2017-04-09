rmdir /s /q ..\..\install
mkdir ..\..\install
mkdir ..\..\install\dist
copy ..\..\package.json ..\..\install
copy start.bat ..\..\install
cd ..\..\install
REM start npm install bebop-bridge-shared
start npm install --production
xcopy /s ..\dist .\dist
cd ..\src\scripts

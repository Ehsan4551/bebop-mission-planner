TITLE "Bebop Mission Planner"
REM start the application
start npm start
REM hack to wait 5 sec.
ping -n 5 127.0.0.1 > NUL
REM Start the default browser
start http://localhost:8080

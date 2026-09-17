Feature: Sign-in page rendering

  Scenario: A normal browser receives the client-side sign-in application
    Given I prepare a "GET" request to "/signin"
    And I set the "User-Agent" header to "Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/51.0.2704.103 Safari/537.36"
    When I send the request
    Then I should see http status 200
    And I should see "SignIn/SignIn.page" on the response body
    And I should see "This website requires JavaScript, please enable and reload the page." on the response body
    And I should see "/assets/js/vendor" on the response body

  Scenario: A crawler receives server-rendered sign-in controls
    Given I prepare a "GET" request to "/signin"
    And I set the "User-Agent" header to "Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)"
    When I send the request
    Then I should see http status 200
    And I should see "input-username" on the response body
    And I should see "input-password" on the response body
    And I should not see "This website requires JavaScript, please enable and reload the page." on the response body
    And I should not see "/assets/js/vendor" on the response body

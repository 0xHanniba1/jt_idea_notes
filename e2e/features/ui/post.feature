Feature: Internal idea records

  Scenario: Admin can sign in with a password and create a post
    Given I sign in as "admin"
    And I click enter your suggestion
    And I type "This is just an example of a feature suggestion in fider" as the description
    And I click submit your feedback
    Then I should be on the show post page
    And I should see "This is just an example of a feature suggestion in fider" as the post title
    And the post should have no voting controls or voter list
    And I should be following the post

  Scenario: An administrator-created member can sign in and view an existing post
    Given I sign in as "member"
    And I search for "Existing internal idea"
    And I click on the first post
    Then I should be on the show post page
    And I should see "Existing internal idea" as the post title
    And the post should have no voting controls or voter list

  Scenario: Anonymous visitors must sign in before viewing internal records
    Given I go to the home page
    Then I should be on the sign in page
